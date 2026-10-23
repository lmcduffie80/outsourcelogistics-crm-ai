import type { Role } from "@/db/schema";

export const assistantToolNames = [
  "searchOrders",
  "getOrder",
  "searchInquiries",
  "getInquiry",
  "draftReply",
  "myMetrics",
  "teamMetrics",
] as const;

export type AssistantToolName = (typeof assistantToolNames)[number];

const managerOnly: AssistantToolName[] = ["teamMetrics"];

export function allowedToolNames(role: Role): AssistantToolName[] {
  const manager = role === "manager" || role === "admin";
  return assistantToolNames.filter((name) => manager || !managerOnly.includes(name));
}
