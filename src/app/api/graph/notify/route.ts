import { timingSafeEqual } from "node:crypto";
import { enqueue } from "@/lib/jobs";

type Notification = {
  clientState?: string;
  changeType: string;
  resourceData?: { id?: string };
};

const secretMatches = (value?: string) => {
  const secret = process.env.GRAPH_WEBHOOK_SECRET ?? "";
  if (!value || !secret || value.length !== secret.length) return false;
  return timingSafeEqual(Buffer.from(value), Buffer.from(secret));
};

/** Microsoft Graph change notifications for new Inbox messages. */
export async function POST(request: Request) {
  // Subscription validation handshake: echo the token as plain text within 10 seconds.
  const validationToken = new URL(request.url).searchParams.get("validationToken");
  if (validationToken) {
    return new Response(validationToken, { status: 200, headers: { "Content-Type": "text/plain" } });
  }

  const payload = (await request.json().catch(() => null)) as { value?: Notification[] } | null;
  if (!payload?.value) return new Response(null, { status: 400 });

  for (const n of payload.value) {
    if (!secretMatches(n.clientState)) continue;
    const id = n.resourceData?.id;
    if (n.changeType === "created" && id) {
      await enqueue("ingest-email", { graphMessageId: id }, { singletonKey: id });
    }
  }
  return new Response(null, { status: 202 });
}
