import "server-only";
import { and, asc, desc, eq, ilike, inArray, isNull, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import {
  aiDrafts,
  customers,
  inquiries,
  inquiryStatusEnum,
  messages,
  serviceTypeEnum,
  users,
  type InquiryStatus,
  type ServiceType,
} from "@/db/schema";
import type { CurrentUser } from "@/lib/auth/session";
import { isManager } from "@/lib/auth/session";
import { openInquiryStatuses } from "@/lib/labels";
import { getSetting } from "@/lib/settings";

export type InquiryFilters = {
  view?: string;
  service?: string;
  rep?: string;
  q?: string;
};

export function parseInquiryFilters(sp: Record<string, string | string[] | undefined>): InquiryFilters {
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  return { view: one("view"), service: one("service"), rep: one("rep"), q: one("q") };
}

export async function listInquiries(user: CurrentUser, filters: InquiryFilters) {
  const where: (SQL | undefined)[] = [];

  const view = filters.view ?? "open";
  if (view === "open") where.push(inArray(inquiries.status, openInquiryStatuses));
  else if ((inquiryStatusEnum.enumValues as readonly string[]).includes(view))
    where.push(eq(inquiries.status, view as InquiryStatus));

  if (filters.service && (serviceTypeEnum.enumValues as readonly string[]).includes(filters.service))
    where.push(eq(inquiries.serviceType, filters.service as ServiceType));

  const rep = filters.rep ?? (isManager(user) ? "all" : "mine");
  if (rep === "mine") where.push(eq(inquiries.assignedRepId, user.id));
  else if (rep === "unassigned") where.push(isNull(inquiries.assignedRepId));
  else if (rep !== "all") where.push(eq(inquiries.assignedRepId, rep));

  if (filters.q?.trim()) {
    const term = `%${filters.q.trim()}%`;
    const num = Number(filters.q.replace(/\D/g, ""));
    where.push(
      or(
        ilike(inquiries.subject, term),
        ilike(customers.name, term),
        ilike(customers.company, term),
        ilike(customers.email, term),
        Number.isFinite(num) && num > 0 ? eq(inquiries.number, num) : undefined,
      ),
    );
  }

  const rows = await db
    .select({
      id: inquiries.id,
      number: inquiries.number,
      subject: inquiries.subject,
      summary: inquiries.summary,
      status: inquiries.status,
      serviceType: inquiries.serviceType,
      priority: inquiries.priority,
      receivedAt: inquiries.receivedAt,
      firstResponseAt: inquiries.firstResponseAt,
      lastInboundAt: inquiries.lastInboundAt,
      lastOutboundAt: inquiries.lastOutboundAt,
      customerName: customers.name,
      company: customers.company,
      repId: users.id,
      repName: users.name,
    })
    .from(inquiries)
    .innerJoin(customers, eq(customers.id, inquiries.customerId))
    .leftJoin(users, eq(users.id, inquiries.assignedRepId))
    .where(and(...where))
    .orderBy(desc(inquiries.receivedAt))
    .limit(500);

  const sla = await getSetting("sla");
  const now = Date.now();
  return rows.map((r) => {
    const open = openInquiryStatuses.includes(r.status);
    const waitingSince = !r.firstResponseAt ? r.receivedAt : r.status === "needs_reply" ? r.lastInboundAt : null;
    const waitingMinutes = open && waitingSince ? (now - waitingSince.getTime()) / 60_000 : null;
    const limit = r.firstResponseAt ? sla.followUpMinutes : sla.firstResponseMinutes;
    return { ...r, waitingMinutes, slaBreached: waitingMinutes !== null && waitingMinutes > limit };
  });
}

export type InquiryRow = Awaited<ReturnType<typeof listInquiries>>[number];

export async function getInquiryDetail(id: string) {
  return db.query.inquiries.findFirst({
    where: eq(inquiries.id, id),
    with: {
      customer: true,
      assignedRep: { columns: { id: true, name: true, email: true } },
      messages: { orderBy: asc(messages.sentAt), with: { sender: { columns: { name: true } } } },
      drafts: { orderBy: desc(aiDrafts.createdAt) },
      orders: true,
      activity: { orderBy: (a, { desc }) => desc(a.createdAt), limit: 30, with: { user: { columns: { name: true } } } },
    },
  });
}

export async function listActiveStaff() {
  return db.query.users.findMany({
    where: eq(users.active, true),
    orderBy: asc(users.name),
    columns: { id: true, name: true, role: true },
  });
}

export async function inquiryCounts(user: CurrentUser) {
  const scope = isManager(user) ? undefined : eq(inquiries.assignedRepId, user.id);
  const [row] = await db
    .select({
      newCount: sql<number>`count(*) filter (where ${inquiries.status} = 'new')::int`,
      draftReady: sql<number>`count(*) filter (where ${inquiries.status} = 'draft_ready')::int`,
      needsReply: sql<number>`count(*) filter (where ${inquiries.status} = 'needs_reply')::int`,
      urgent: sql<number>`count(*) filter (where ${inquiries.priority} = 'urgent' and ${inquiries.status} in ('new','draft_ready','needs_reply'))::int`,
    })
    .from(inquiries)
    .where(scope);
  return row;
}
