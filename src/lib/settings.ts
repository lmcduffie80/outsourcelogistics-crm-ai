import { eq } from "drizzle-orm";
import { db } from "@/db";
import { settings } from "@/db/schema";
import { defaultModel } from "@/lib/ai/provider";

export type AckTemplate = { subject: string; body: string };
export type SlaSettings = { firstResponseMinutes: number; followUpMinutes: number };
export type AiSettings = { model: string; replyGuidelines: string };
export type AssignmentSettings = { mode: "customer_owner_then_round_robin" | "round_robin" };
export type GraphState = {
  deltaLink?: string;
  subscriptionId?: string;
  subscriptionExpiresAt?: string;
  lastSyncAt?: string;
};

export type SettingsMap = {
  ackTemplate: AckTemplate;
  sla: SlaSettings;
  ai: AiSettings;
  assignment: AssignmentSettings;
  graphState: GraphState;
  roundRobinCursor: { lastRepId?: string };
};

export const defaultSettings: SettingsMap = {
  ackTemplate: {
    subject: "We received your request: {{subject}} [{{inquiryNumber}}]",
    body: [
      "Hi {{firstName}},",
      "",
      "Thank you for contacting Outsource Logistics. We received your {{serviceType}} request and have assigned it reference number {{inquiryNumber}}.",
      "",
      "{{repName}} on our customer service team is reviewing the details and will follow up with a complete response shortly. If anything is time-sensitive, call us at (866) 726-2715.",
      "",
      "Thank you,",
      "Outsource Logistics",
      "Warehouse. Port Services. Logistics.",
    ].join("\n"),
  },
  sla: { firstResponseMinutes: 120, followUpMinutes: 240 },
  ai: {
    model: defaultModel,
    replyGuidelines: [
      "Be warm, concise, and professional.",
      "Never quote a firm price; say a rep will confirm rates after reviewing details.",
      "Ask only for details that are missing and needed to quote (origin, destination, commodity, weight, dates, hazmat).",
      "Mention our Savannah port, warehousing, transloading, and Southeast trucking capabilities only when relevant.",
    ].join("\n"),
  },
  assignment: { mode: "customer_owner_then_round_robin" },
  graphState: {},
  roundRobinCursor: {},
};

export async function getSetting<K extends keyof SettingsMap>(key: K): Promise<SettingsMap[K]> {
  const row = await db.query.settings.findFirst({ where: eq(settings.key, key) });
  if (!row) return defaultSettings[key];
  const fallback = defaultSettings[key];
  return (typeof fallback === "object" && fallback !== null
    ? { ...fallback, ...(row.value as object) }
    : row.value) as SettingsMap[K];
}

export async function setSetting<K extends keyof SettingsMap>(key: K, value: SettingsMap[K]) {
  await db
    .insert(settings)
    .values({ key, value })
    .onConflictDoUpdate({ target: settings.key, set: { value } });
}

export { renderTemplate } from "./template";
