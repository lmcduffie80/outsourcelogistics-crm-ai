import { getSetting, setSetting } from "@/lib/settings";
import { GraphError, graphFetch, mailboxPath } from "./client";

/** Mail subscriptions can live at most 10,080 minutes; renew well before that. */
const LIFETIME_MINUTES = 60 * 24 * 3;

const notificationUrl = () => `${process.env.GRAPH_WEBHOOK_BASE_URL!.replace(/\/$/, "")}/api/graph/notify`;

export const webhookConfigured = () => Boolean(process.env.GRAPH_WEBHOOK_BASE_URL && process.env.GRAPH_WEBHOOK_SECRET);

/** Creates the Inbox change subscription, or extends the existing one. */
export async function ensureSubscription() {
  if (!webhookConfigured()) return { status: "skipped" as const };
  const state = await getSetting("graphState");
  const expirationDateTime = new Date(Date.now() + LIFETIME_MINUTES * 60_000).toISOString();

  if (state.subscriptionId) {
    try {
      await graphFetch(`/subscriptions/${state.subscriptionId}`, {
        method: "PATCH",
        body: JSON.stringify({ expirationDateTime }),
      });
      await setSetting("graphState", { ...state, subscriptionExpiresAt: expirationDateTime });
      return { status: "renewed" as const, expiresAt: expirationDateTime };
    } catch (err) {
      if (!(err instanceof GraphError && err.status === 404)) throw err;
    }
  }

  const sub = await graphFetch<{ id: string; expirationDateTime: string }>("/subscriptions", {
    method: "POST",
    body: JSON.stringify({
      changeType: "created",
      notificationUrl: notificationUrl(),
      resource: `${mailboxPath()}/mailFolders('Inbox')/messages`,
      expirationDateTime,
      clientState: process.env.GRAPH_WEBHOOK_SECRET,
    }),
  });
  await setSetting("graphState", {
    ...state,
    subscriptionId: sub.id,
    subscriptionExpiresAt: sub.expirationDateTime,
  });
  return { status: "created" as const, expiresAt: sub.expirationDateTime };
}
