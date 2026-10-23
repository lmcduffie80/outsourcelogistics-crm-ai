# AI assistant chat panel

## Goal

A chat assistant, powered by the configured AI provider (OpenAI `gpt-5.4-mini` by default), that staff can open from any page to look up orders and inquiries, draft client replies, and get quick analytics.

## Decisions

- **Placement:** a right-side slide-out panel opened from an "Assistant" button in the top bar, available on every page in the `(app)` group.
- **Page context:** on `/inquiries/[id]` the panel sends that inquiry id with every message; the assistant treats it as "this inquiry".
- **Replies:** draft only. The assistant returns reply text; a "Put in reply box" button fills the existing reply composer. The rep reviews and sends. The assistant has no tool that sends email.
- **Access:** mirrors the app. Reps can read any order or inquiry and their own metrics. Team metrics and other reps' metrics are managers/admins only. Enforced server-side by building the tool set per role.
- **History:** kept in client memory for the browser tab; "New chat" clears it. No database table.

## Architecture

- `src/app/api/assistant/route.ts` — POST handler. Authenticates via `getCurrentUser`, builds tools for the user's role, calls `streamText` with the model from settings, a step cap, and returns a UI message stream.
- `src/lib/assistant/tools.ts` — `assistantTools(user, context)` returns the role-filtered tool set. Each tool validates input with zod, queries via existing helpers (`listOrders`, inquiry queries, `teamMetrics`, `orderCounts`), and truncates results (row caps, trimmed message bodies).
- `src/lib/assistant/prompt.ts` — system prompt: company context, role, today's date, current inquiry summary when present, rules (no invented data, cite order/inquiry numbers, replies are drafts).
- `src/components/assistant/` — panel (Sheet), message list with markdown rendering, input, starter suggestions, and the draft-reply card.
- Reply hand-off: a small client store shared by the panel and the inquiry `ReplyComposer`; "Put in reply box" sets the composer body for the matching inquiry.

## Tools

| Tool | Roles | Purpose |
| --- | --- | --- |
| `searchOrders` | all | Filter by customer/search text, rep, status, service, date range; returns up to 25 rows plus total count. |
| `getOrder` | all | One order by number with customer, rep, dates, linked inquiry. |
| `searchInquiries` | all | Filter by text, status, service, rep; up to 25 rows. |
| `getInquiry` | all | Inquiry details, extracted fields, and the last messages of the thread (bodies trimmed). |
| `draftReply` | all | Returns a structured draft `{ inquiryId, body }` the UI renders with a "Put in reply box" button. |
| `myMetrics` | all | The current user's response-time and order stats for a range. |
| `teamMetrics` | manager, admin | Team summary, per-rep stats, service volume for a range. |

## Also in scope

- Guard `/manager` and `/manager/reps/[id]` server-side so reps cannot open them by URL.

## Error handling

- Provider failure: the panel shows an inline error with a Retry button; other app features are unaffected.
- Tool errors return a short message to the model instead of throwing, so it can explain or retry.
- Unauthenticated requests get 401.

## Privacy

Chat content and tool results are sent to the configured provider. The panel footer states this when the provider is OpenAI.

## Testing

- Unit tests: tool set per role (rep lacks `teamMetrics`; `myMetrics` is scoped to the caller).
- Manual browser checks: order lookup, reply draft into composer on an inquiry, manager analytics question, rep asking for team stats is declined.
