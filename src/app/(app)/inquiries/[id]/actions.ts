"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { activityLog, inquiries, priorityEnum, serviceTypeEnum, users } from "@/db/schema";
import { getCurrentUser, isManager, type CurrentUser } from "@/lib/auth/session";
import { convertToOrder, generateDraft, sendRepReply } from "@/lib/inquiries/service";

export type ActionResult = { ok: true; message?: string } | { ok: false; error: string };

async function authorize(inquiryId: string): Promise<{ user: CurrentUser; inquiry: typeof inquiries.$inferSelect }> {
  const user = await getCurrentUser();
  const inquiry = await db.query.inquiries.findFirst({ where: eq(inquiries.id, inquiryId) });
  if (!inquiry) throw new Error("Inquiry not found");
  const allowed = isManager(user) || !inquiry.assignedRepId || inquiry.assignedRepId === user.id;
  if (!allowed) throw new Error("This inquiry is assigned to another rep");
  return { user, inquiry };
}

async function run(inquiryId: string, fn: () => Promise<string | void>): Promise<ActionResult> {
  try {
    const message = await fn();
    revalidatePath(`/inquiries/${inquiryId}`);
    revalidatePath("/inquiries");
    return { ok: true, message: message ?? undefined };
  } catch (err) {
    if (err instanceof z.ZodError) return { ok: false, error: err.issues[0]?.message ?? "Invalid input" };
    return { ok: false, error: err instanceof Error ? err.message : "Something went wrong" };
  }
}

export async function sendReplyAction(inquiryId: string, draftId: string | null, body: string) {
  return run(inquiryId, async () => {
    const { user } = await authorize(inquiryId);
    if (body.trim().length < 10) throw new Error("Reply is too short");
    await sendRepReply({ inquiryId, userId: user.id, body: body.trim(), draftId });
    return "Reply sent";
  });
}

export async function regenerateDraftAction(inquiryId: string) {
  return run(inquiryId, async () => {
    const { user } = await authorize(inquiryId);
    const r = await generateDraft(inquiryId, user.id);
    return r.usedFallback ? "AI server unavailable; used the template draft" : "New AI draft ready";
  });
}

const detailsSchema = z.object({
  serviceType: z.enum(serviceTypeEnum.enumValues),
  priority: z.enum(priorityEnum.enumValues),
  origin: z.string().trim(),
  destination: z.string().trim(),
  commodity: z.string().trim(),
  weight: z.string().trim(),
  volume: z.string().trim(),
  requestedDate: z.string().trim(),
  hazmat: z.boolean(),
  foodGrade: z.boolean(),
  summary: z.string().trim(),
});

export async function updateDetailsAction(inquiryId: string, formData: FormData) {
  return run(inquiryId, async () => {
    const { user, inquiry } = await authorize(inquiryId);
    const f = (k: string) => String(formData.get(k) ?? "");
    const parsed = detailsSchema.parse({
      serviceType: f("serviceType"),
      priority: f("priority"),
      origin: f("origin"),
      destination: f("destination"),
      commodity: f("commodity"),
      weight: f("weight"),
      volume: f("volume"),
      requestedDate: f("requestedDate"),
      hazmat: formData.get("hazmat") === "on",
      foodGrade: formData.get("foodGrade") === "on",
      summary: f("summary"),
    });
    const orNull = (s: string) => s || null;
    const extracted = {
      isCustomerInquiry: true,
      customerName: inquiry.extracted?.customerName ?? null,
      company: inquiry.extracted?.company ?? null,
      phone: inquiry.extracted?.phone ?? null,
      questions: inquiry.extracted?.questions ?? [],
      serviceType: parsed.serviceType,
      priority: parsed.priority,
      summary: parsed.summary,
      origin: orNull(parsed.origin),
      destination: orNull(parsed.destination),
      commodity: orNull(parsed.commodity),
      weight: orNull(parsed.weight),
      volume: orNull(parsed.volume),
      requestedDate: orNull(parsed.requestedDate),
      hazmat: parsed.hazmat,
      foodGrade: parsed.foodGrade,
    };
    await db
      .update(inquiries)
      .set({ serviceType: parsed.serviceType, priority: parsed.priority, summary: parsed.summary, extracted })
      .where(eq(inquiries.id, inquiryId));
    await db.insert(activityLog).values({ inquiryId, userId: user.id, type: "details.updated" });
    return "Details saved";
  });
}

export async function reassignAction(inquiryId: string, repId: string) {
  return run(inquiryId, async () => {
    const { user } = await authorize(inquiryId);
    const rep = await db.query.users.findFirst({ where: and(eq(users.id, repId), eq(users.active, true)) });
    if (!rep) throw new Error("Rep not found");
    await db.update(inquiries).set({ assignedRepId: rep.id }).where(eq(inquiries.id, inquiryId));
    await db.insert(activityLog).values({
      inquiryId,
      userId: user.id,
      type: "inquiry.reassigned",
      details: { to: rep.name },
    });
    return `Assigned to ${rep.name}`;
  });
}

export async function setClosedAction(inquiryId: string, closed: boolean) {
  return run(inquiryId, async () => {
    const { user, inquiry } = await authorize(inquiryId);
    const status = closed ? "closed" : inquiry.firstResponseAt ? "responded" : "draft_ready";
    await db
      .update(inquiries)
      .set({ status, closedAt: closed ? new Date() : null })
      .where(eq(inquiries.id, inquiryId));
    await db.insert(activityLog).values({
      inquiryId,
      userId: user.id,
      type: closed ? "inquiry.closed" : "inquiry.reopened",
    });
    return closed ? "Inquiry closed" : "Inquiry reopened";
  });
}

const orderSchema = z.object({
  serviceType: z.enum(serviceTypeEnum.enumValues),
  description: z.string().trim().min(3, "Add a short description"),
  origin: z.string().trim(),
  destination: z.string().trim(),
  value: z.string().trim(),
});

export async function convertToOrderAction(inquiryId: string, formData: FormData) {
  return run(inquiryId, async () => {
    const { user } = await authorize(inquiryId);
    const parsed = orderSchema.parse(Object.fromEntries(formData));
    const value = parsed.value ? Number(parsed.value.replace(/[$,]/g, "")) : null;
    if (value !== null && !Number.isFinite(value)) throw new Error("Order value must be a number");
    await convertToOrder({
      inquiryId,
      userId: user.id,
      serviceType: parsed.serviceType,
      description: parsed.description,
      origin: parsed.origin || null,
      destination: parsed.destination || null,
      value,
    });
    revalidatePath("/orders");
    return "Order created";
  });
}
