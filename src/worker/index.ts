import { getBoss, type JobPayloads } from "@/lib/jobs";
import { getMessage, inboxDelta } from "@/lib/graph/mail";
import { ensureSubscription } from "@/lib/graph/subscriptions";
import { generateDraft, ingestEmail, sendAcknowledgment } from "@/lib/inquiries/service";
import { inboxLive, MailSendingDisabledError, transportName } from "@/lib/mail/transport";
import { getSetting, setSetting } from "@/lib/settings";

const log = (...args: unknown[]) => console.log(new Date().toISOString(), "[worker]", ...args);

async function main() {
  const boss = await getBoss({ worker: true });
  const graphLive = inboxLive();
  log(`started (mail transport: ${transportName()})`);

  await boss.work<JobPayloads["ingest-email"]>("ingest-email", { localConcurrency: 4 }, async ([job]) => {
    const email = await getMessage(job.data.graphMessageId);
    const result = await ingestEmail(email);
    log("ingest-email", job.data.graphMessageId, result.kind);
    if (result.kind === "created") {
      await boss.send("send-ack", { inquiryId: result.inquiryId }, { singletonKey: result.inquiryId, retryLimit: 5, retryBackoff: true });
      await boss.send("draft-reply", { inquiryId: result.inquiryId }, { retryLimit: 3, retryBackoff: true });
    } else if (result.kind === "appended") {
      await boss.send("draft-reply", { inquiryId: result.inquiryId }, { retryLimit: 3, retryBackoff: true });
    }
  });

  await boss.work<JobPayloads["send-ack"]>("send-ack", async ([job]) => {
    try {
      const r = await sendAcknowledgment(job.data.inquiryId);
      log("send-ack", job.data.inquiryId, r.skipped ? "skipped" : "sent");
    } catch (err) {
      if (!(err instanceof MailSendingDisabledError)) throw err;
      log("send-ack", job.data.inquiryId, "not sent (read-only mailbox)");
    }
  });

  // One draft at a time: a single Ollama instance processes requests serially anyway.
  await boss.work<JobPayloads["draft-reply"]>("draft-reply", { localConcurrency: 1 }, async ([job]) => {
    const r = await generateDraft(job.data.inquiryId, job.data.requestedById);
    log("draft-reply", job.data.inquiryId, r.usedFallback ? `fallback (${r.error})` : "ok");
  });

  await boss.work("sync-mailbox", async () => {
    if (!graphLive) return;
    const state = await getSetting("graphState");
    const { ids, deltaLink } = await inboxDelta(state.deltaLink);
    for (const id of ids) {
      await boss.send("ingest-email", { graphMessageId: id }, { singletonKey: id, retryLimit: 3, retryBackoff: true });
    }
    await setSetting("graphState", { ...(await getSetting("graphState")), deltaLink, lastSyncAt: new Date().toISOString() });
    if (ids.length) log("sync-mailbox queued", ids.length);
  });

  await boss.work("renew-subscription", async () => {
    if (!graphLive) return;
    log("renew-subscription", (await ensureSubscription()).status);
  });

  if (graphLive) {
    await boss.schedule("sync-mailbox", "*/2 * * * *");
    await boss.schedule("renew-subscription", "0 */12 * * *");
    await boss.send("renew-subscription", {});
    await boss.send("sync-mailbox", {});
  }

  const shutdown = async () => {
    log("stopping");
    await boss.stop({ graceful: true });
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
