import { graphFetch, mailbox, mailboxPath } from "./client";

export type InboundEmail = {
  graphMessageId: string | null;
  internetMessageId: string;
  conversationId: string | null;
  fromAddress: string;
  fromName: string | null;
  toAddresses: string[];
  subject: string;
  bodyText: string;
  receivedAt: Date;
};

type GraphRecipient = { emailAddress: { address: string; name?: string } };
type GraphMessage = {
  id: string;
  internetMessageId: string;
  conversationId: string;
  subject: string | null;
  from?: GraphRecipient;
  toRecipients: GraphRecipient[];
  receivedDateTime: string;
  body?: { content: string };
  uniqueBody?: { content: string };
  "@removed"?: unknown;
};

const SELECT = "id,internetMessageId,conversationId,subject,from,toRecipients,receivedDateTime,body,uniqueBody";

function normalize(m: GraphMessage): InboundEmail {
  return {
    graphMessageId: m.id,
    internetMessageId: m.internetMessageId,
    conversationId: m.conversationId,
    fromAddress: (m.from?.emailAddress.address ?? "").toLowerCase(),
    fromName: m.from?.emailAddress.name ?? null,
    toAddresses: m.toRecipients.map((r) => r.emailAddress.address.toLowerCase()),
    subject: m.subject ?? "(no subject)",
    // uniqueBody strips quoted history so replies store only the new text.
    bodyText: (m.uniqueBody?.content || m.body?.content || "").trim(),
    receivedAt: new Date(m.receivedDateTime),
  };
}

export async function getMessage(graphMessageId: string): Promise<InboundEmail> {
  const m = await graphFetch<GraphMessage>(
    `${mailboxPath()}/messages/${encodeURIComponent(graphMessageId)}?$select=${SELECT}`,
    { preferText: true },
  );
  return normalize(m);
}

/**
 * Returns ids of Inbox messages added since the last delta link. The first call
 * (no link) starts from the last day so a fresh install doesn't import the whole mailbox.
 */
export async function inboxDelta(deltaLink?: string) {
  let url =
    deltaLink ??
    `${mailboxPath()}/mailFolders('Inbox')/messages/delta?$select=id,from,receivedDateTime&$filter=receivedDateTime ge ${new Date(
      Date.now() - 86_400_000,
    ).toISOString()}`;
  const ids: string[] = [];
  for (;;) {
    const page = await graphFetch<{
      value: Pick<GraphMessage, "id" | "from" | "@removed">[];
      "@odata.nextLink"?: string;
      "@odata.deltaLink"?: string;
    }>(url);
    for (const m of page.value) if (!m["@removed"] && m.from) ids.push(m.id);
    if (page["@odata.nextLink"]) url = page["@odata.nextLink"];
    else return { ids, deltaLink: page["@odata.deltaLink"]! };
  }
}

export type OutboundEmail = {
  to: string[];
  subject: string;
  bodyText: string;
  fromName?: string;
  /** Graph id of the message being replied to; keeps the reply in the customer's thread. */
  replyToGraphMessageId?: string | null;
};

const htmlBody = (text: string) =>
  `<div style="font-family:'Open Sans',Arial,sans-serif;font-size:14px;color:#222">${text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\n/g, "<br>")}</div>`;

const recipients = (to: string[]) => to.map((address) => ({ emailAddress: { address } }));

/** Sends from the shared mailbox, threading onto the original message when possible. */
export async function sendViaGraph(email: OutboundEmail): Promise<{ graphMessageId: string | null; conversationId: string | null }> {
  const base = mailboxPath();
  if (email.replyToGraphMessageId) {
    const draft = await graphFetch<GraphMessage>(
      `${base}/messages/${encodeURIComponent(email.replyToGraphMessageId)}/createReply`,
      { method: "POST", body: JSON.stringify({}) },
    );
    await graphFetch(`${base}/messages/${draft.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        subject: email.subject,
        toRecipients: recipients(email.to),
        body: { contentType: "HTML", content: htmlBody(email.bodyText) },
      }),
    });
    await graphFetch(`${base}/messages/${draft.id}/send`, { method: "POST" });
    return { graphMessageId: draft.id, conversationId: draft.conversationId };
  }
  await graphFetch(`${base}/sendMail`, {
    method: "POST",
    body: JSON.stringify({
      message: {
        subject: email.subject,
        toRecipients: recipients(email.to),
        from: { emailAddress: { address: mailbox(), name: email.fromName ?? "Outsource Logistics" } },
        body: { contentType: "HTML", content: htmlBody(email.bodyText) },
      },
      saveToSentItems: true,
    }),
  });
  return { graphMessageId: null, conversationId: null };
}
