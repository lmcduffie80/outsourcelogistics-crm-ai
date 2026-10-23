"use server";

import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { activityLog, roleEnum, users } from "@/db/schema";
import { draftReply } from "@/lib/ai/ollama";
import { requireRole } from "@/lib/auth/session";
import { setSetting } from "@/lib/settings";

export type ActionResult = { ok: true; message?: string } | { ok: false; error: string };

async function run(fn: (adminId: string) => Promise<string>): Promise<ActionResult> {
  try {
    const admin = await requireRole("admin");
    const message = await fn(admin.id);
    revalidatePath("/settings");
    return { ok: true, message };
  } catch (err) {
    unstable_rethrow(err);
    if (err instanceof z.ZodError) return { ok: false, error: err.issues[0]?.message ?? "Invalid input" };
    return { ok: false, error: err instanceof Error ? err.message : "Something went wrong" };
  }
}

const userInput = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email("Enter a valid email address")),
  name: z.string().trim().min(2, "Enter the person's name"),
  role: z.enum(roleEnum.enumValues),
});

export async function addUserAction(input: z.input<typeof userInput>) {
  return run(async (adminId) => {
    const data = userInput.parse(input);
    const existing = await db.query.users.findFirst({ where: eq(users.email, data.email) });
    if (existing) throw new Error(`${data.email} already has an account`);
    const [created] = await db.insert(users).values(data).returning({ id: users.id });
    await db.insert(activityLog).values({
      userId: adminId,
      type: "user.created",
      details: { targetUserId: created.id, email: data.email, role: data.role },
    });
    return `${data.name} added. They can sign in with Microsoft now.`;
  });
}

const userUpdate = z.object({
  role: z.enum(roleEnum.enumValues).optional(),
  active: z.boolean().optional(),
});

export async function updateUserAction(userId: string, input: z.input<typeof userUpdate>) {
  return run(async (adminId) => {
    const data = userUpdate.parse(input);
    if (userId === adminId && (data.active === false || (data.role && data.role !== "admin"))) {
      throw new Error("You can't remove your own admin access");
    }
    const [updated] = await db.update(users).set(data).where(eq(users.id, userId)).returning({ name: users.name });
    if (!updated) throw new Error("User not found");
    await db.insert(activityLog).values({ userId: adminId, type: "user.updated", details: { targetUserId: userId, ...data } });
    return `${updated.name} updated`;
  });
}

const ackInput = z.object({
  subject: z.string().trim().min(5, "Subject is too short").max(200),
  body: z.string().trim().min(20, "Message is too short").max(5000),
});

export async function saveAckTemplateAction(input: z.input<typeof ackInput>) {
  return run(async () => {
    const data = ackInput.parse(input);
    if (!data.subject.includes("{{inquiryNumber}}")) {
      throw new Error("Keep {{inquiryNumber}} in the subject so customer replies thread back to the inquiry");
    }
    await setSetting("ackTemplate", data);
    return "Acknowledgment template saved";
  });
}

const slaInput = z.object({
  firstResponseMinutes: z.coerce.number().int().min(5, "Minimum is 5 minutes").max(60 * 24 * 7),
  followUpMinutes: z.coerce.number().int().min(5, "Minimum is 5 minutes").max(60 * 24 * 7),
  assignmentMode: z.enum(["customer_owner_then_round_robin", "round_robin"]),
});

export async function saveSlaAction(input: z.input<typeof slaInput>) {
  return run(async () => {
    const data = slaInput.parse(input);
    await setSetting("sla", { firstResponseMinutes: data.firstResponseMinutes, followUpMinutes: data.followUpMinutes });
    await setSetting("assignment", { mode: data.assignmentMode });
    return "Response targets saved";
  });
}

const aiInput = z.object({
  model: z.string().trim().min(1, "Choose a model").max(100),
  replyGuidelines: z.string().trim().min(10, "Add at least one guideline").max(4000),
});

export async function saveAiAction(input: z.input<typeof aiInput>) {
  return run(async () => {
    await setSetting("ai", aiInput.parse(input));
    return "AI settings saved";
  });
}

export async function testAiAction(): Promise<ActionResult & { sample?: string }> {
  let sample = "";
  const result = await run(async () => {
    const r = await draftReply({
      inquiryNumber: "INQ-TEST",
      customerName: "Jordan Test",
      company: "Test Imports LLC",
      repName: "Maria Santos",
      extraction: null,
      thread: [
        {
          direction: "inbound",
          sentBy: "customer",
          fromName: "Jordan Test",
          bodyText:
            "Hi, we have 2x40HC of palletized furniture arriving at Garden City next week. Can you pick up, store for about 30 days, and deliver to Atlanta? Thanks.",
          sentAt: new Date(),
        },
      ],
    });
    sample = r.value;
    if (r.usedFallback) throw new Error(`The model didn't respond (${r.error ?? "unknown error"})`);
    return `${r.model} responded`;
  });
  return { ...result, sample };
}
