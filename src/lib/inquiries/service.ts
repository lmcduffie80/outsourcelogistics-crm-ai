import { and, asc, desc, eq } from "drizzle-orm";
import { distance } from "fastest-levenshtein";
import { db } from "@/db";
import {
  activityLog,
  aiDrafts,
  customers,
  inquiries,
  messages,
  orders,
  users,
  type Customer,
  type ServiceType,
} from "@/db/schema";
import { draftReply, extractInquiry } from "@/lib/ai/ollama";
import { mailbox } from "@/lib/graph/client";
import type { InboundEmail } from "@/lib/graph/mail";
import { inquiryNumber, serviceTypeLabels } from "@/lib/labels";
import { sendEmail } from "@/lib/mail/transport";
import { getSetting, renderTemplate, setSetting } from "@/lib/settings";

const INQUIRY_TOKEN = /\[INQ-(\d+)\]/i;

export type IngestResult =
  | { kind: "duplicate" | "ignored"; reason: string }
  | { kind: "created"; inquiryId: string }
  | { kind: "appended"; inquiryId: string };

/** Converts one inbound email into a new inquiry, or appends it to an existing thread. */
export async function ingestEmail(email: InboundEmail): Promise<IngestResult> {
  const existingMessage = await db.query.messages.findFirst({
    where: eq(messages.internetMessageId, email.internetMessageId),
    columns: { id: true },
  });
  if (existingMessage) return { kind: "duplicate", reason: "already ingested" };
  if (email.fromAddress === mailbox().toLowerCase()) return { kind: "ignored", reason: "sent from our mailbox" };

  const thread = await findThread(email);
  if (thread) {
    await db.transaction(async (tx) => {
      await tx.insert(messages).values({
        inquiryId: thread.id,
        direction: "inbound",
        sentBy: "customer",
        fromAddress: email.fromAddress,
        fromName: email.fromName,
        toAddresses: email.toAddresses,
        subject: email.subject,
        bodyText: email.bodyText,
        graphMessageId: email.graphMessageId,
        internetMessageId: email.internetMessageId,
        conversationId: email.conversationId,
        sentAt: email.receivedAt,
      });
      await tx
        .update(inquiries)
        .set({
          status: thread.status === "converted" ? "converted" : "needs_reply",
          lastInboundAt: email.receivedAt,
          closedAt: null,
        })
        .where(eq(inquiries.id, thread.id));
      await tx.insert(activityLog).values({ inquiryId: thread.id, type: "customer.replied" });
    });
    return { kind: "appended", inquiryId: thread.id };
  }

  const extraction = await extractInquiry({
    fromName: email.fromName,
    fromAddress: email.fromAddress,
    subject: email.subject,
    body: email.bodyText,
  });
  if (!extraction.value.isCustomerInquiry) return { kind: "ignored", reason: "not a customer inquiry" };

  const customer = await upsertCustomer(email, extraction.value);
  const repId = await chooseRep(customer);

  const inquiryId = await db.transaction(async (tx) => {
    const [inquiry] = await tx
      .insert(inquiries)
      .values({
        subject: email.subject,
        customerId: customer.id,
        assignedRepId: repId,
        status: "new",
        serviceType: extraction.value.serviceType,
        priority: extraction.value.priority,
        summary: extraction.value.summary,
        extracted: extraction.value,
        conversationId: email.conversationId,
        receivedAt: email.receivedAt,
        lastInboundAt: email.receivedAt,
      })
      .returning({ id: inquiries.id });
    await tx.insert(messages).values({
      inquiryId: inquiry.id,
      direction: "inbound",
      sentBy: "customer",
      fromAddress: email.fromAddress,
      fromName: email.fromName,
      toAddresses: email.toAddresses,
      subject: email.subject,
      bodyText: email.bodyText,
      graphMessageId: email.graphMessageId,
      internetMessageId: email.internetMessageId,
      conversationId: email.conversationId,
      sentAt: email.receivedAt,
    });
    await tx.insert(activityLog).values({
      inquiryId: inquiry.id,
      type: "inquiry.created",
      details: { source: "email", extractionModel: extraction.model, extractionFallback: extraction.usedFallback },
    });
    return inquiry.id;
  });

  return { kind: "created", inquiryId };
}

async function findThread(email: InboundEmail) {
  const token = email.subject.match(INQUIRY_TOKEN);
  if (token) {
    const byNumber = await db.query.inquiries.findFirst({ where: eq(inquiries.number, Number(token[1])) });
    if (byNumber) return byNumber;
  }
  if (email.conversationId) {
    return db.query.inquiries.findFirst({
      where: eq(inquiries.conversationId, email.conversationId),
      orderBy: desc(inquiries.receivedAt),
    });
  }
  return undefined;
}

async function upsertCustomer(
  email: InboundEmail,
  info: { customerName: string | null; company: string | null; phone: string | null },
): Promise<Customer> {
  const existing = await db.query.customers.findFirst({ where: eq(customers.email, email.fromAddress) });
  if (existing) {
    const patch = {
      company: existing.company ?? info.company,
      phone: existing.phone ?? info.phone,
    };
    if (patch.company !== existing.company || patch.phone !== existing.phone) {
      const [updated] = await db.update(customers).set(patch).where(eq(customers.id, existing.id)).returning();
      return updated;
    }
    return existing;
  }
  const [created] = await db
    .insert(customers)
    .values({
      email: email.fromAddress,
      name: info.customerName ?? email.fromName ?? email.fromAddress.split("@")[0],
      company: info.company,
      phone: info.phone,
    })
    .returning();
  return created;
}

/** Customer's owner when active, otherwise the next active rep in round-robin order. */
export async function chooseRep(customer: Customer): Promise<string | null> {
  const assignment = await getSetting("assignment");
  const activeReps = await db.query.users.findMany({
    where: and(eq(users.role, "rep"), eq(users.active, true)),
    orderBy: asc(users.name),
    columns: { id: true },
  });
  if (activeReps.length === 0) return null;

  if (assignment.mode === "customer_owner_then_round_robin" && customer.ownerId) {
    if (activeReps.some((r) => r.id === customer.ownerId)) return customer.ownerId;
  }

  const cursor = await getSetting("roundRobinCursor");
  const lastIndex = activeReps.findIndex((r) => r.id === cursor.lastRepId);
  const next = activeReps[(lastIndex + 1) % activeReps.length];
  await setSetting("roundRobinCursor", { lastRepId: next.id });
  if (!customer.ownerId) await db.update(customers).set({ ownerId: next.id }).where(eq(customers.id, customer.id));
  return next.id;
}

async function loadInquiry(inquiryId: string) {
  const inquiry = await db.query.inquiries.findFirst({
    where: eq(inquiries.id, inquiryId),
    with: { customer: true, assignedRep: true, messages: { orderBy: asc(messages.sentAt) } },
  });
  if (!inquiry) throw new Error(`Inquiry ${inquiryId} not found`);
  return inquiry;
}

const latestInbound = (msgs: { direction: string; graphMessageId: string | null }[]) =>
  [...msgs].reverse().find((m) => m.direction === "inbound" && m.graphMessageId)?.graphMessageId ?? null;

const replySubject = (subject: string, number: number) => {
  const base = subject.replace(INQUIRY_TOKEN, "").trim();
  return `${/^re:/i.test(base) ? base : `RE: ${base}`} [${inquiryNumber(number)}]`;
};

/** Sends the automatic acknowledgment for a new inquiry. Idempotent. */
export async function sendAcknowledgment(inquiryId: string) {
  const inquiry = await loadInquiry(inquiryId);
  if (inquiry.ackSentAt) return { skipped: true };

  const template = await getSetting("ackTemplate");
  const vars = {
    firstName: inquiry.customer.name.split(" ")[0],
    customerName: inquiry.customer.name,
    inquiryNumber: inquiryNumber(inquiry.number),
    subject: inquiry.subject.replace(/^(re|fw|fwd):\s*/i, ""),
    serviceType: serviceTypeLabels[inquiry.serviceType].toLowerCase(),
    repName: inquiry.assignedRep?.name ?? "A member of our team",
  };
  const subject = renderTemplate(template.subject, vars);
  const bodyText = renderTemplate(template.body, vars);

  const sent = await sendEmail({
    to: [inquiry.customer.email],
    subject,
    bodyText,
    replyToGraphMessageId: latestInbound(inquiry.messages),
  });
  const now = new Date();
  await db.transaction(async (tx) => {
    await tx.insert(messages).values({
      inquiryId,
      direction: "outbound",
      sentBy: "system",
      fromAddress: sent.fromAddress,
      fromName: "Outsource Logistics",
      toAddresses: [inquiry.customer.email],
      subject,
      bodyText,
      graphMessageId: sent.graphMessageId,
      internetMessageId: sent.internetMessageId,
      conversationId: sent.conversationId ?? inquiry.conversationId,
      sentAt: now,
    });
    await tx.update(inquiries).set({ ackSentAt: now, lastOutboundAt: now }).where(eq(inquiries.id, inquiryId));
    await tx.insert(activityLog).values({ inquiryId, type: "ack.sent" });
  });
  return { skipped: false };
}

/** Generates a fresh AI draft for the next reply and discards older pending drafts. */
export async function generateDraft(inquiryId: string, requestedById?: string) {
  const inquiry = await loadInquiry(inquiryId);
  const result = await draftReply({
    inquiryNumber: inquiryNumber(inquiry.number),
    customerName: inquiry.customer.name,
    company: inquiry.customer.company,
    repName: inquiry.assignedRep?.name ?? "Outsource Logistics Customer Service",
    extraction: inquiry.extracted ?? null,
    thread: inquiry.messages,
  });

  const draft = await db.transaction(async (tx) => {
    await tx
      .update(aiDrafts)
      .set({ status: "discarded" })
      .where(and(eq(aiDrafts.inquiryId, inquiryId), eq(aiDrafts.status, "pending")));
    const [row] = await tx
      .insert(aiDrafts)
      .values({ inquiryId, model: result.model, generatedText: result.value, requestedById })
      .returning();
    if (inquiry.status === "new") {
      await tx.update(inquiries).set({ status: "draft_ready" }).where(eq(inquiries.id, inquiryId));
    }
    await tx.insert(activityLog).values({
      inquiryId,
      userId: requestedById,
      type: "draft.generated",
      details: { model: result.model, fallback: result.usedFallback, error: result.error },
    });
    return row;
  });
  return { draft, usedFallback: result.usedFallback, error: result.error };
}

export async function sendRepReply(params: {
  inquiryId: string;
  userId: string;
  body: string;
  draftId?: string | null;
}) {
  const inquiry = await loadInquiry(params.inquiryId);
  const rep = await db.query.users.findFirst({ where: eq(users.id, params.userId) });
  if (!rep) throw new Error("Unknown user");
  const subject = replySubject(inquiry.subject, inquiry.number);

  const sent = await sendEmail({
    to: [inquiry.customer.email],
    subject,
    bodyText: params.body,
    fromName: rep.name,
    replyToGraphMessageId: latestInbound(inquiry.messages),
  });

  const now = new Date();
  await db.transaction(async (tx) => {
    let aiDraftId: string | null = null;
    if (params.draftId) {
      const draft = await tx.query.aiDrafts.findFirst({
        where: and(eq(aiDrafts.id, params.draftId), eq(aiDrafts.inquiryId, inquiry.id)),
      });
      if (draft) {
        aiDraftId = draft.id;
        const editDistance = distance(draft.generatedText, params.body);
        await tx
          .update(aiDrafts)
          .set({
            status: "sent",
            finalText: params.body,
            editDistance,
            editRatio: editDistance / Math.max(draft.generatedText.length, 1),
            sentAt: now,
          })
          .where(eq(aiDrafts.id, draft.id));
      }
    }
    await tx.insert(messages).values({
      inquiryId: inquiry.id,
      direction: "outbound",
      sentBy: "rep",
      senderUserId: rep.id,
      aiDraftId,
      fromAddress: sent.fromAddress,
      fromName: rep.name,
      toAddresses: [inquiry.customer.email],
      subject,
      bodyText: params.body,
      graphMessageId: sent.graphMessageId,
      internetMessageId: sent.internetMessageId,
      conversationId: sent.conversationId ?? inquiry.conversationId,
      sentAt: now,
    });
    await tx
      .update(inquiries)
      .set({
        status: inquiry.status === "converted" ? "converted" : "responded",
        firstResponseAt: inquiry.firstResponseAt ?? now,
        lastOutboundAt: now,
        assignedRepId: inquiry.assignedRepId ?? rep.id,
      })
      .where(eq(inquiries.id, inquiry.id));
    await tx.insert(activityLog).values({ inquiryId: inquiry.id, userId: rep.id, type: "reply.sent" });
  });
}

export async function convertToOrder(params: {
  inquiryId: string;
  userId: string;
  serviceType: ServiceType;
  description: string;
  origin: string | null;
  destination: string | null;
  value: number | null;
}) {
  const inquiry = await loadInquiry(params.inquiryId);
  return db.transaction(async (tx) => {
    const [order] = await tx
      .insert(orders)
      .values({
        inquiryId: inquiry.id,
        customerId: inquiry.customerId,
        repId: inquiry.assignedRepId ?? params.userId,
        serviceType: params.serviceType,
        description: params.description,
        origin: params.origin,
        destination: params.destination,
        value: params.value,
      })
      .returning();
    await tx.update(inquiries).set({ status: "converted" }).where(eq(inquiries.id, inquiry.id));
    await tx
      .update(aiDrafts)
      .set({ status: "discarded" })
      .where(and(eq(aiDrafts.inquiryId, inquiry.id), eq(aiDrafts.status, "pending")));
    await tx.insert(activityLog).values({
      inquiryId: inquiry.id,
      orderId: order.id,
      userId: params.userId,
      type: "order.created",
    });
    return order;
  });
}

/** Open-inquiry counts per rep, used for balancing and dashboards. */