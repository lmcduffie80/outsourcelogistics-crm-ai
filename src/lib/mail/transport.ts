import { randomUUID } from "node:crypto";
import { graphConfigured, mailbox } from "@/lib/graph/client";
import { sendViaGraph, type OutboundEmail } from "@/lib/graph/mail";

export type SentEmail = {
  graphMessageId: string | null;
  internetMessageId: string;
  conversationId: string | null;
  fromAddress: string;
};

export type TransportName = "graph" | "graph-readonly" | "fake";

/**
 * MAIL_TRANSPORT=graph reads the inbox and sends; graph-readonly reads the inbox
 * but refuses to send; fake (the default) neither reads nor sends and logs outbound mail.
 */
export const transportName = (): TransportName => {
  const mode = process.env.MAIL_TRANSPORT;
  if (!graphConfigured()) return "fake";
  return mode === "graph" || mode === "graph-readonly" ? mode : "fake";
};

export const inboxLive = () => transportName() !== "fake";

export class MailSendingDisabledError extends Error {
  constructor() {
    super("Sending is turned off while the mailbox is connected read-only (MAIL_TRANSPORT=graph-readonly)");
  }
}

export async function sendEmail(email: OutboundEmail): Promise<SentEmail> {
  const internetMessageId = `<crm-${randomUUID()}@outsourcelogistics.com>`;
  const transport = transportName();
  if (transport === "graph-readonly") throw new MailSendingDisabledError();
  if (transport === "graph") {
    const sent = await sendViaGraph(email);
    return { ...sent, internetMessageId, fromAddress: mailbox() };
  }
  console.log(`[mail:fake] to=${email.to.join(",")} subject="${email.subject}"`);
  return { graphMessageId: null, internetMessageId, conversationId: null, fromAddress: mailbox() };
}
