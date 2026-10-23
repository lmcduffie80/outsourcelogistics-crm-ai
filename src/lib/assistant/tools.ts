import "server-only";
import { tool, type InferUITools, type ToolSet, type UIDataTypes, type UIMessage } from "ai";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { customers, inquiries, inquiryStatusEnum, orderStatusEnum, orders, serviceTypeEnum, users } from "@/db/schema";
import type { CurrentUser } from "@/lib/auth/session";
import { getInquiryDetail, listActiveStaff, listInquiries } from "@/lib/inquiries/queries";
import { inquiryNumber, orderNumber } from "@/lib/labels";
import { teamMetrics } from "@/lib/metrics";
import { listOrders, orderCounts, type OrderRange } from "@/lib/orders";
import { allowedToolNames } from "./access";

const ROW_LIMIT = 25;
const BODY_LIMIT = 1500;

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);
const minutes = (from: Date | null, to: Date | null) =>
  from && to ? Math.round((to.getTime() - from.getTime()) / 60_000) : null;

async function repIdByName(name: string | undefined) {
  if (!name?.trim()) return undefined;
  const staff = await listActiveStaff();
  const match = staff.find((s) => s.name.toLowerCase().includes(name.trim().toLowerCase()));
  if (!match) throw new Error(`No active staff member matches "${name}"`);
  return match.id;
}

/** Order values are not reliably captured from emails, so revenue is kept out of the model's view. */
function withoutRevenue<T extends { revenueCompleted: number }>(row: T): Omit<T, "revenueCompleted"> {
  const copy: Partial<T> = { ...row };
  delete copy.revenueCompleted;
  return copy as Omit<T, "revenueCompleted">;
}

const parseNumber = (value: string) => {
  const n = Number(value.replace(/\D/g, ""));
  if (!Number.isFinite(n) || n <= 0) throw new Error(`"${value}" is not a valid number`);
  return n;
};

/** Every tool is read-only; the draft tool only returns text for the rep to review. */
function buildTools(user: CurrentUser) {
  return {
    searchOrders: tool({
      description:
        "Search orders. Filters are optional. Returns up to 25 most recent matches plus completed/open counts for the same filters.",
      inputSchema: z.object({
        search: z.string().optional().describe("Customer name, company, description, external reference, or ORD number"),
        status: z.enum([...orderStatusEnum.enumValues, "all"]).default("all"),
        service: z.enum(serviceTypeEnum.enumValues).optional(),
        repName: z.string().optional().describe("Part of the rep's name"),
        range: z.enum(["30d", "90d", "365d", "all"]).default("90d").describe("By completion date for completed orders, else booking date"),
      }),
      execute: async ({ search, status, service, repName, range }) => {
        const filters = { q: search, status, service, rep: await repIdByName(repName), range: range as OrderRange };
        const [rows, counts] = await Promise.all([listOrders(filters), orderCounts(filters)]);
        return {
          totalMatches: rows.length,
          completedInRange: counts.completed,
          openNow: counts.open,
          orders: rows.slice(0, ROW_LIMIT).map((r) => ({
            order: orderNumber(r.number),
            externalRef: r.externalRef,
            customer: r.company ?? r.customerName,
            contact: r.customerName,
            service: r.serviceType,
            description: r.description,
            route: [r.origin, r.destination].filter(Boolean).join(" → ") || null,
            status: r.status,
            rep: r.repName,
            bookedAt: iso(r.bookedAt),
            completedAt: iso(r.completedAt),
          })),
        };
      },
    }),

    getOrder: tool({
      description: "Get one order by its number, e.g. ORD-5074.",
      inputSchema: z.object({ order: z.string() }),
      execute: async ({ order }) => {
        const [row] = await db
          .select({
            number: orders.number,
            externalRef: orders.externalRef,
            status: orders.status,
            serviceType: orders.serviceType,
            description: orders.description,
            origin: orders.origin,
            destination: orders.destination,
            bookedAt: orders.bookedAt,
            completedAt: orders.completedAt,
            repName: users.name,
            customerName: customers.name,
            company: customers.company,
            customerEmail: customers.email,
            inquiryNumber: inquiries.number,
          })
          .from(orders)
          .innerJoin(customers, eq(customers.id, orders.customerId))
          .leftJoin(users, eq(users.id, orders.repId))
          .leftJoin(inquiries, eq(inquiries.id, orders.inquiryId))
          .where(eq(orders.number, parseNumber(order)))
          .limit(1);
        if (!row) return { error: `Order ${order} not found` };
        return {
          ...row,
          number: orderNumber(row.number),
          inquiryNumber: row.inquiryNumber ? inquiryNumber(row.inquiryNumber) : null,
          bookedAt: iso(row.bookedAt),
          completedAt: iso(row.completedAt),
        };
      },
    }),

    searchInquiries: tool({
      description: "Search customer inquiries (email threads). Returns up to 25 most recent matches.",
      inputSchema: z.object({
        search: z.string().optional().describe("Subject, customer name, company, email, or INQ number"),
        status: z.enum([...inquiryStatusEnum.enumValues, "open", "all"]).default("all"),
        service: z.enum(serviceTypeEnum.enumValues).optional(),
        repName: z.string().optional(),
        assignedToMe: z.boolean().optional(),
      }),
      execute: async ({ search, status, service, repName, assignedToMe }) => {
        const rep = assignedToMe ? "mine" : ((await repIdByName(repName)) ?? "all");
        const rows = await listInquiries(user, { q: search, view: status, service, rep });
        return {
          totalMatches: rows.length,
          inquiries: rows.slice(0, ROW_LIMIT).map((r) => ({
            inquiry: inquiryNumber(r.number),
            subject: r.subject,
            summary: r.summary,
            customer: r.company ?? r.customerName,
            status: r.status,
            service: r.serviceType,
            priority: r.priority,
            rep: r.repName,
            receivedAt: iso(r.receivedAt),
            firstResponseMinutes: minutes(r.receivedAt, r.firstResponseAt),
            waitingMinutes: r.waitingMinutes === null ? null : Math.round(r.waitingMinutes),
            overResponseTarget: r.slaBreached,
          })),
        };
      },
    }),

    getInquiry: tool({
      description:
        "Get an inquiry with extracted details and the email thread (newest messages last). Accepts an INQ number or an inquiry id.",
      inputSchema: z.object({ inquiry: z.string() }),
      execute: async ({ inquiry }) => {
        const id = /^[0-9a-f-]{36}$/i.test(inquiry)
          ? inquiry
          : (
              await db.query.inquiries.findFirst({
                where: eq(inquiries.number, parseNumber(inquiry)),
                columns: { id: true },
              })
            )?.id;
        const detail = id ? await getInquiryDetail(id) : undefined;
        if (!detail) return { error: `Inquiry ${inquiry} not found` };
        return {
          id: detail.id,
          inquiry: inquiryNumber(detail.number),
          subject: detail.subject,
          status: detail.status,
          service: detail.serviceType,
          priority: detail.priority,
          summary: detail.summary,
          extracted: detail.extracted,
          customer: {
            name: detail.customer.name,
            company: detail.customer.company,
            email: detail.customer.email,
          },
          rep: detail.assignedRep?.name ?? null,
          receivedAt: iso(detail.receivedAt),
          firstResponseMinutes: minutes(detail.receivedAt, detail.firstResponseAt),
          orders: detail.orders.map((o) => ({ order: orderNumber(o.number), status: o.status })),
          messages: detail.messages.slice(-8).map((m) => ({
            from: m.sentBy === "customer" ? `${m.fromName ?? ""} <${m.fromAddress}>`.trim() : (m.sender?.name ?? m.sentBy),
            sentBy: m.sentBy,
            sentAt: iso(m.sentAt),
            body: m.bodyText.length > BODY_LIMIT ? `${m.bodyText.slice(0, BODY_LIMIT)}…` : m.bodyText,
          })),
        };
      },
    }),

    draftReply: tool({
      description:
        "Hand a finished reply draft to the user. Call getInquiry first so the draft reflects the thread. The rep reviews and sends it; this never sends email.",
      inputSchema: z.object({
        inquiryId: z.string().describe("The inquiry id (uuid) from getInquiry"),
        body: z.string().min(10).describe("Plain-text email body, signed off as the rep"),
      }),
      execute: async ({ inquiryId, body }) => {
        const found = await db.query.inquiries.findFirst({
          where: eq(inquiries.id, inquiryId),
          columns: { id: true, number: true },
        });
        if (!found) return { error: "Inquiry not found; call getInquiry first" };
        return { inquiryId: found.id, inquiry: inquiryNumber(found.number), body };
      },
    }),

    myMetrics: tool({
      description: "The signed-in user's own response times, target compliance and completed orders.",
      inputSchema: z.object({ range: z.enum(["7d", "30d", "90d"]).default("30d") }),
      execute: async ({ range }) => {
        const { reps, sla } = await teamMetrics(range, user.id);
        return { range, responseTargetsMinutes: sla, me: reps[0] ? withoutRevenue(reps[0]) : null };
      },
    }),

    teamMetrics: tool({
      description:
        "Team-wide analytics for managers: summary, per-rep stats and daily inquiry volume by service. Minutes are response times.",
      inputSchema: z.object({ range: z.enum(["7d", "30d", "90d"]).default("30d") }),
      execute: async ({ range }) => {
        const { reps, summary, trend, sla } = await teamMetrics(range);
        return {
          range,
          responseTargetsMinutes: sla,
          summary: withoutRevenue(summary),
          reps: reps.map(withoutRevenue),
          dailyTrend: trend,
        };
      },
    }),
  } satisfies ToolSet;
}

export type AssistantTools = ReturnType<typeof buildTools>;
export type AssistantUIMessage = UIMessage<never, UIDataTypes, InferUITools<AssistantTools>>;

/** The tool set the user's role may call; tools outside it are never offered to the model. */
export function assistantTools(user: CurrentUser): ToolSet {
  const allowed = new Set<string>(allowedToolNames(user.role));
  return Object.fromEntries(Object.entries(buildTools(user)).filter(([name]) => allowed.has(name)));
}
