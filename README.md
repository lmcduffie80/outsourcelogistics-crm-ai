# Outsource Logistics CRM

Customer service hub for [Outsource Logistics](https://outsourcelogistics.com). Customer emails to the shared quotes mailbox become inquiries automatically, the customer gets an acknowledgment within seconds, and a self-hosted open-source model drafts the full reply for a rep to review and send. Managers get a team dashboard with response times, SLA compliance, and completed orders.

## How it works

1. **Email arrives** in the Microsoft 365 shared mailbox. Graph pushes a change notification to `/api/graph/notify`; the worker also polls the inbox with delta sync every 2 minutes, so nothing is missed if the webhook is down.
2. **Worker ingests it** (`ingest-email` job): fetches the message, threads it onto an existing inquiry by its `[INQ-1234]` subject token or Outlook conversation, and otherwise creates a new inquiry. Ollama extracts service type, priority, origin/destination, commodity, weight, hazmat, and the customer's questions.
3. **Acknowledgment** (`send-ack`): the editable template goes out from the shared mailbox, in the customer's thread, naming the assigned rep.
4. **AI draft** (`draft-reply`): Ollama writes a reply using the thread, extracted details, and admin-defined guidelines.
5. **Rep reviews and sends** from the inquiry page. The edit distance between the AI draft and what was sent is recorded, so managers can see how much reps rely on the AI.
6. **Convert to order** when the customer books, then mark it completed from the Orders page. Orders from other systems can be imported by CSV.

If Ollama is unreachable, inquiries are still created and acknowledged, using keyword-based extraction and a template draft that the rep can regenerate later.

## Stack

Next.js 16 (App Router), Tailwind v4 + shadcn/ui, Auth.js with Microsoft Entra ID, Postgres + Drizzle ORM, pg-boss for background jobs, AI SDK with Ollama's OpenAI-compatible API, Microsoft Graph for mail.

| Path | What |
| --- | --- |
| `src/app/(app)/inquiries` | Rep queue and inquiry detail (thread, AI draft editor, shipment details) |
| `src/app/(app)/manager` | Team dashboard and per-rep drill-down |
| `src/app/(app)/orders` | Orders table, monthly totals, CSV import/export |
| `src/app/(app)/settings` | Admin: team access, acknowledgment template, response targets, AI model, integration status |
| `src/worker` | pg-boss worker process |
| `src/lib/inquiries/service.ts` | Ingest, acknowledge, draft, reply, convert |
| `src/lib/graph` | Graph auth, mail, subscriptions |
| `src/lib/ai` | Extraction and drafting prompts, fallbacks |

## Local development

Requires Node 24 and pnpm.

```bash
pnpm install
cp .env.example .env          # then set AUTH_SECRET: openssl rand -base64 32
```

Start Postgres, either with Docker (`docker compose up -d postgres`) or the embedded server, which needs no Docker and listens on port 5433:

```bash
pnpm db:local                 # leave running; set DATABASE_URL=postgres://crm:crm@localhost:5433/crm
```

Then:

```bash
pnpm db:migrate
pnpm db:seed                  # 8 staff, 22 customers, ~190 inquiries over 60 days, orders
pnpm dev                      # http://localhost:3000
pnpm dev:worker               # in another terminal
```

With `AUTH_DEMO=true`, the login page lists the seeded staff so you can sign in as a rep, manager (Marcus Bell), or admin (Dana Whitfield) without Microsoft. Demo sign-in is always disabled in production builds.

### Simulating email without Microsoft 365

With `MAIL_TRANSPORT=fake`, outbound mail is logged instead of sent.

```bash
pnpm mail:simulate                                   # sample drayage + storage request, processed inline
pnpm mail:simulate --from jane@acme.com --name "Jane Doe" --subject "Need LTL" --body "..."
pnpm mail:simulate --reply 1191 --body "Can we book it?"   # customer reply threaded onto INQ-1191
pnpm mail:simulate --queue                           # hand the ack and draft to the running worker
```

### Ollama

Install [Ollama](https://ollama.com) and pull the model:

```bash
ollama pull qwen2.5:14b       # ~9 GB; needs a GPU with 12+ GB VRAM for good speed
```

`llama3.1:8b` works on smaller GPUs. Change the model any time under **Settings → AI model**, which also lists installed models and can generate a sample draft.

### Checks

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm build
```

## Microsoft 365 setup

Create two app registrations in Microsoft Entra ID (or one, if you prefer).

**Staff sign-in**

- Platform: Web. Redirect URI: `{APP_URL}/api/auth/callback/microsoft-entra-id`
- Create a client secret, then set `AUTH_MICROSOFT_ENTRA_ID_ID`, `AUTH_MICROSOFT_ENTRA_ID_SECRET`, and `AUTH_MICROSOFT_ENTRA_ID_ISSUER=https://login.microsoftonline.com/<tenant-id>/v2.0`.
- Anyone signing in with an email on `ALLOWED_EMAIL_DOMAINS` gets a rep account. `ADMIN_EMAILS` are made admins. Admins can pre-add people with other roles or deactivate accounts under **Settings → Team**.

**Mailbox access (app-only)**

- API permissions → Microsoft Graph → **Application**: `Mail.ReadWrite` and `Mail.Send`. Grant admin consent.
- Restrict the app to the shared mailbox only, with an [application access policy](https://learn.microsoft.com/graph/auth-limit-mailbox-access) or RBAC for Applications in Exchange Online. Without this, the app can read every mailbox in the tenant.
- Set `GRAPH_TENANT_ID`, `GRAPH_CLIENT_ID`, `GRAPH_CLIENT_SECRET`, `GRAPH_MAILBOX`, and `MAIL_TRANSPORT=graph`.
- For instant pickup, set `GRAPH_WEBHOOK_BASE_URL` to the app's public HTTPS URL and `GRAPH_WEBHOOK_SECRET` to a random string. The worker creates the inbox subscription and renews it every 12 hours. Without these, the 2-minute delta poll still picks up all mail.

The admin **Settings** page shows whether the mailbox, webhook, AI server, and sign-in are configured.

## Deployment

`docker-compose.yml` runs the whole stack on one host: Postgres, Ollama (uncomment the GPU block on an NVIDIA host), a one-time model pull, migrations, the web app, and the worker.

```bash
docker compose up -d --build
```

The web app and worker are separate processes from the same image (`node server.js` and `node dist/worker.mjs`). Run exactly one worker per database if you scale the web tier. Keep Ollama on the private network: customer email content is sent to it and it has no authentication.

### CSV import format

Header row required. Only `external_ref` and `customer_email` are mandatory. Re-importing a file updates orders with the same `external_ref`.

```
external_ref,customer_email,customer_name,company,service_type,status,value,booked_at,completed_at,rep_email,description,origin,destination
```
