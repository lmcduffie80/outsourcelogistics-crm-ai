import { randomUUID } from "node:crypto";
import { graphConfigured, mailbox } from "@/lib/graph/client";
import { sendViaGraph, type OutboundEmail } from "@/lib/graph/mail";

export type SentEmail = {
  graphMessageId: string | null;
  internetMessageId: string;
  conversationId: string | null;
  fromAddress: string;
};

export const transportName = () =>
  process.env.MAIL_TRANSPORT === "graph" && graphConfigured() ? "graph" : "fake";

/**
 * Sends email from the shared mailbox. With MAIL_TRANSPORT=fake (the default
 * without Graph credentials), nothing leaves the server; the message is logged.
 */
export async function sendEmail(email: OutboundEmail): Promise<SentEmail> {
  const internetMessageId = `<crm-${randomUUID()}@outsourcelogistics.com>`;
  if (transportName() === "graph") {
    const sent = await sendViaGraph(email);
    return { ...sent, internetMessageId, fromAddress: mailbox() };
  }
  console.log(`[mail:fake] to=${email.to.join(",")} subject="${email.subject}"`);
  return { graphMessageId: null, internetMessageId, conversationId: null, fromAddress: mailbox() };
}
