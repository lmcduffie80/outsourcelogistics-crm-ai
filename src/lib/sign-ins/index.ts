import "server-only";
import { headers } from "next/headers";
import { and, countDistinct, desc, eq, gte, sql, type SQL } from "drizzle-orm";
import { subDays } from "date-fns";
import { db } from "@/db";
import { signInEvents } from "@/db/schema";

type SignInAttempt = {
  email: string;
  name?: string | null;
  userId?: string | null;
  allowed: boolean;
  reason?: string;
  method: "microsoft" | "demo";
};

const decode = (v: string | null) => {
  if (!v) return null;
  try {
    return decodeURIComponent(v);
  } catch {
    return v;
  }
};

/** Records a sign-in attempt. Never throws, so logging can't block anyone from signing in. */
export async function recordSignIn(attempt: SignInAttempt) {
  try {
    const h = await headers().catch(() => null);
    const ip = h?.get("x-real-ip") ?? h?.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
    await db.insert(signInEvents).values({
      email: attempt.email.toLowerCase(),
      name: attempt.name ?? null,
      userId: attempt.userId ?? null,
      allowed: attempt.allowed,
      reason: attempt.reason ?? null,
      method: attempt.method,
      ipAddress: ip,
      city: decode(h?.get("x-vercel-ip-city") ?? null),
      region: h?.get("x-vercel-ip-country-region") ?? null,
      country: h?.get("x-vercel-ip-country") ?? null,
      userAgent: h?.get("user-agent")?.slice(0, 500) ?? null,
    });
  } catch (err) {
    console.error("[sign-in] could not record sign-in", err);
  }
}

export type SignInFilters = { range: "7d" | "30d" | "90d" | "all"; result: "all" | "allowed" | "denied"; q: string };

export function parseSignInFilters(sp: Record<string, string | string[] | undefined>): SignInFilters {
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  const range = one("range");
  const result = one("result");
  return {
    range: range === "7d" || range === "90d" || range === "all" ? range : "30d",
    result: result === "allowed" || result === "denied" ? result : "all",
    q: one("q")?.trim() ?? "",
  };
}

const rangeDays = { "7d": 7, "30d": 30, "90d": 90 } as const;

function whereFor(f: SignInFilters, opts: { ignoreResult?: boolean } = {}) {
  const parts: (SQL | undefined)[] = [
    f.range === "all" ? undefined : gte(signInEvents.createdAt, subDays(new Date(), rangeDays[f.range])),
    opts.ignoreResult || f.result === "all" ? undefined : eq(signInEvents.allowed, f.result === "allowed"),
    f.q
      ? sql`(${signInEvents.email} ilike ${`%${f.q}%`} or ${signInEvents.name} ilike ${`%${f.q}%`})`
      : undefined,
  ];
  return and(...parts);
}

export function listSignIns(f: SignInFilters, limit = 200) {
  return db.select().from(signInEvents).where(whereFor(f)).orderBy(desc(signInEvents.createdAt)).limit(limit);
}

export async function signInSummary(f: SignInFilters) {
  const [row] = await db
    .select({
      allowed: sql<number>`count(*) filter (where ${signInEvents.allowed})::int`,
      denied: sql<number>`count(*) filter (where not ${signInEvents.allowed})::int`,
      people: countDistinct(sql`case when ${signInEvents.allowed} then ${signInEvents.email} end`),
    })
    .from(signInEvents)
    .where(whereFor(f, { ignoreResult: true }));
  return { allowed: row?.allowed ?? 0, denied: row?.denied ?? 0, people: row?.people ?? 0 };
}
