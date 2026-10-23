import "server-only";
import { and, asc, eq, gte, inArray, isNotNull, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import { aiDrafts, inquiries, messages, orders, users, type ServiceType } from "@/db/schema";
import { openInquiryStatuses, serviceTypeLabels } from "@/lib/labels";
import { getSetting } from "@/lib/settings";

export const ranges = { "7d": 7, "30d": 30, "90d": 90 } as const;
export type RangeKey = keyof typeof ranges;

export function parseRange(value: unknown): RangeKey {
  return typeof value === "string" && value in ranges ? (value as RangeKey) : "30d";
}

export const rangeStart = (range: RangeKey) => new Date(Date.now() - ranges[range] * 86_400_000);

const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const dayKey = (d: Date) => d.toISOString().slice(0, 10);

export type RepMetrics = {
  repId: string;
  name: string;
  active: boolean;
  open: number;
  received: number;
  responded: number;
  firstResponseAvg: number | null;
  firstResponseMedian: number | null;
  replyAvg: number | null;
  repliesSent: number;
  slaBreaches: number;
  slaMeasured: number;
  slaCompliance: number | null;
  aiDraftsUsed: number;
  aiEditRatio: number | null;
  ordersCompleted: number;
  revenueCompleted: number;
  conversionRate: number | null;
};

/**
 * Responsiveness metrics per rep for inquiries received in the range.
 * "First response" is measured to the first human reply; the automatic
 * acknowledgment does not count.
 */
export async function teamMetrics(range: RangeKey, onlyRepId?: string) {
  const start = rangeStart(range);
  const now = new Date();
  const sla = await getSetting("sla");

  const [staff, rangeInquiries, openRows, replyMessages, drafts, completed] = await Promise.all([
    db.query.users.findMany({
      where: onlyRepId ? eq(users.id, onlyRepId) : eq(users.role, "rep"),
      columns: { id: true, name: true, active: true },
      orderBy: asc(users.name),
    }),
    db
      .select({
        id: inquiries.id,
        repId: inquiries.assignedRepId,
        receivedAt: inquiries.receivedAt,
        firstResponseAt: inquiries.firstResponseAt,
        status: inquiries.status,
        serviceType: inquiries.serviceType,
      })
      .from(inquiries)
      .where(gte(inquiries.receivedAt, start)),
    db
      .select({ repId: inquiries.assignedRepId, n: sql<number>`count(*)::int` })
      .from(inquiries)
      .where(inArray(inquiries.status, openInquiryStatuses))
      .groupBy(inquiries.assignedRepId),
    db
      .select({
        inquiryId: messages.inquiryId,
        sentBy: messages.sentBy,
        senderUserId: messages.senderUserId,
        aiDraftId: messages.aiDraftId,
        sentAt: messages.sentAt,
      })
      .from(messages)
      .where(and(gte(messages.sentAt, start), inArray(messages.sentBy, ["customer", "rep"])))
      .orderBy(asc(messages.inquiryId), asc(messages.sentAt)),
    db
      .select({ repId: messages.senderUserId, editRatio: aiDrafts.editRatio })
      .from(aiDrafts)
      .innerJoin(messages, eq(messages.aiDraftId, aiDrafts.id))
      .where(and(eq(aiDrafts.status, "sent"), gte(aiDrafts.sentAt, start), isNotNull(aiDrafts.editRatio))),
    db
      .select({
        repId: orders.repId,
        n: sql<number>`count(*)::int`,
        revenue: sql<number>`coalesce(sum(${orders.value}), 0)::float`,
      })
      .from(orders)
      .where(and(eq(orders.status, "completed"), gte(orders.completedAt, start), lte(orders.completedAt, now)))
      .groupBy(orders.repId),
  ]);

  // Pair each rep reply with the earliest customer message it answered.
  const replyTimes = new Map<string, number[]>();
  let current: string | null = null;
  let pendingSince: Date | null = null;
  for (const m of replyMessages) {
    if (m.inquiryId !== current) {
      current = m.inquiryId;
      pendingSince = null;
    }
    if (m.sentBy === "customer") pendingSince ??= m.sentAt;
    else if (m.sentBy === "rep" && pendingSince && m.senderUserId) {
      const list = replyTimes.get(m.senderUserId) ?? [];
      list.push((m.sentAt.getTime() - pendingSince.getTime()) / 60_000);
      replyTimes.set(m.senderUserId, list);
      pendingSince = null;
    }
  }

  const reps: RepMetrics[] = staff.map((rep) => {
    const mine = rangeInquiries.filter((i) => i.repId === rep.id);
    const firsts = mine
      .filter((i) => i.firstResponseAt)
      .map((i) => (i.firstResponseAt!.getTime() - i.receivedAt.getTime()) / 60_000);
    const breaches = mine.filter((i) => {
      const waited = ((i.firstResponseAt ?? now).getTime() - i.receivedAt.getTime()) / 60_000;
      return waited > sla.firstResponseMinutes && (i.firstResponseAt || i.status !== "closed");
    }).length;
    const measurable = mine.filter(
      (i) =>
        i.firstResponseAt ||
        (i.status !== "closed" && (now.getTime() - i.receivedAt.getTime()) / 60_000 > sla.firstResponseMinutes),
    ).length;
    const myReplies = replyMessages.filter((m) => m.sentBy === "rep" && m.senderUserId === rep.id);
    const myEdits = drafts.filter((d) => d.repId === rep.id).map((d) => d.editRatio!);
    const done = completed.find((c) => c.repId === rep.id);
    return {
      repId: rep.id,
      name: rep.name,
      active: rep.active,
      open: openRows.find((o) => o.repId === rep.id)?.n ?? 0,
      received: mine.length,
      responded: firsts.length,
      firstResponseAvg: mean(firsts),
      firstResponseMedian: median(firsts),
      replyAvg: mean(replyTimes.get(rep.id) ?? []),
      repliesSent: myReplies.length,
      slaBreaches: breaches,
      slaMeasured: measurable,
      slaCompliance: measurable ? 1 - breaches / measurable : null,
      aiDraftsUsed: myReplies.filter((m) => m.aiDraftId).length,
      aiEditRatio: mean(myEdits),
      ordersCompleted: done?.n ?? 0,
      revenueCompleted: done?.revenue ?? 0,
      conversionRate: mine.length ? mine.filter((i) => i.status === "converted").length / mine.length : null,
    };
  });

  const scoped = onlyRepId ? rangeInquiries.filter((i) => i.repId === onlyRepId) : rangeInquiries;
  const allFirsts = scoped
    .filter((i) => i.firstResponseAt)
    .map((i) => (i.firstResponseAt!.getTime() - i.receivedAt.getTime()) / 60_000);
  const totalBreaches = reps.reduce((a, r) => a + r.slaBreaches, 0);
  const measurable = reps.reduce((a, r) => a + r.slaMeasured, 0);

  // Daily trend: median first response + inquiry volume by service.
  const days: string[] = [];
  for (let d = new Date(start); d <= now; d = new Date(d.getTime() + 86_400_000)) days.push(dayKey(d));
  const trend = days.map((day) => {
    const todays = scoped.filter((i) => dayKey(i.receivedAt) === day);
    const firsts = todays
      .filter((i) => i.firstResponseAt)
      .map((i) => (i.firstResponseAt!.getTime() - i.receivedAt.getTime()) / 60_000);
    const byService = Object.fromEntries(
      (Object.keys(serviceTypeLabels) as ServiceType[]).map((s) => [s, todays.filter((i) => i.serviceType === s).length]),
    );
    return { day, medianFirstResponse: median(firsts), total: todays.length, ...byService };
  });

  return {
    sla,
    reps,
    summary: {
      received: scoped.length,
      open: reps.reduce((a, r) => a + r.open, 0),
      medianFirstResponse: median(allFirsts),
      avgFirstResponse: mean(allFirsts),
      slaBreaches: totalBreaches,
      slaCompliance: measurable ? 1 - totalBreaches / measurable : null,
      ordersCompleted: reps.reduce((a, r) => a + r.ordersCompleted, 0),
      revenueCompleted: reps.reduce((a, r) => a + r.revenueCompleted, 0),
    },
    trend,
  };
}

export type TeamMetrics = Awaited<ReturnType<typeof teamMetrics>>;
