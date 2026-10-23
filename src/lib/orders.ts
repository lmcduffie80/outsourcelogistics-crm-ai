import "server-only";
import { and, desc, eq, gte, ilike, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { customers, orderStatusEnum, orders, serviceTypeEnum, users, type OrderStatus, type ServiceType } from "@/db/schema";

export const orderRanges = { "30d": 30, "90d": 90, "365d": 365, all: null } as const;
export type OrderRange = keyof typeof orderRanges;

export type OrderFilters = {
  status: string;
  range: OrderRange;
  rep?: string;
  service?: string;
  q?: string;
};

export function parseOrderFilters(sp: Record<string, string | string[] | undefined>): OrderFilters {
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  const range = one("range");
  return {
    status: one("status") ?? "completed",
    range: range && range in orderRanges ? (range as OrderRange) : "90d",
    rep: one("rep"),
    service: one("service"),
    q: one("q"),
  };
}

function whereFor(filters: OrderFilters) {
  const where: (SQL | undefined)[] = [];
  const completedView = filters.status === "completed";
  if ((orderStatusEnum.enumValues as readonly string[]).includes(filters.status))
    where.push(eq(orders.status, filters.status as OrderStatus));

  const days = orderRanges[filters.range];
  if (days) {
    const since = new Date(Date.now() - days * 86_400_000);
    where.push(completedView ? gte(orders.completedAt, since) : gte(orders.bookedAt, since));
  }
  if (filters.rep && filters.rep !== "all") where.push(eq(orders.repId, filters.rep));
  if (filters.service && (serviceTypeEnum.enumValues as readonly string[]).includes(filters.service))
    where.push(eq(orders.serviceType, filters.service as ServiceType));
  if (filters.q?.trim()) {
    const term = `%${filters.q.trim()}%`;
    const num = Number(filters.q.replace(/\D/g, ""));
    where.push(
      or(
        ilike(customers.name, term),
        ilike(customers.company, term),
        ilike(orders.description, term),
        ilike(orders.externalRef, term),
        Number.isFinite(num) && num > 0 ? eq(orders.number, num) : undefined,
      ),
    );
  }
  return and(...where);
}

export async function listOrders(filters: OrderFilters) {
  return db
    .select({
      id: orders.id,
      number: orders.number,
      externalRef: orders.externalRef,
      inquiryId: orders.inquiryId,
      status: orders.status,
      serviceType: orders.serviceType,
      description: orders.description,
      origin: orders.origin,
      destination: orders.destination,
      value: orders.value,
      bookedAt: orders.bookedAt,
      completedAt: orders.completedAt,
      repId: orders.repId,
      repName: users.name,
      customerName: customers.name,
      company: customers.company,
      customerEmail: customers.email,
    })
    .from(orders)
    .innerJoin(customers, eq(customers.id, orders.customerId))
    .leftJoin(users, eq(users.id, orders.repId))
    .where(whereFor(filters))
    .orderBy(desc(sql`coalesce(${orders.completedAt}, ${orders.bookedAt})`))
    .limit(2000);
}

export type OrderRow = Awaited<ReturnType<typeof listOrders>>[number];

/** Totals per calendar month, keyed on completion date for completed orders and booking date otherwise. */
export function totalsByMonth(rows: OrderRow[]) {
  const map = new Map<string, { month: string; count: number; revenue: number }>();
  for (const r of rows) {
    const d = r.completedAt ?? r.bookedAt;
    const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const entry = map.get(month) ?? { month, count: 0, revenue: 0 };
    entry.count++;
    entry.revenue += r.value ?? 0;
    map.set(month, entry);
  }
  return [...map.values()].sort((a, b) => b.month.localeCompare(a.month));
}
