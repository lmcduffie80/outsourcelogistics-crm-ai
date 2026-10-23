import { PgBoss, type SendOptions } from "pg-boss";

export type JobPayloads = {
  "ingest-email": { graphMessageId: string };
  "send-ack": { inquiryId: string };
  "draft-reply": { inquiryId: string; requestedById?: string };
  "sync-mailbox": Record<string, never>;
  "renew-subscription": Record<string, never>;
};
export type QueueName = keyof JobPayloads;

export const queueNames: QueueName[] = ["ingest-email", "send-ack", "draft-reply", "sync-mailbox", "renew-subscription"];

const globalForBoss = globalThis as unknown as { boss?: Promise<PgBoss> };

/**
 * Lazily starts a pg-boss client. The web app only sends jobs, so it skips
 * maintenance and cron; the worker process passes `{ worker: true }`.
 */
export function getBoss({ worker = false } = {}) {
  globalForBoss.boss ??= (async () => {
    const boss = new PgBoss({
      connectionString: process.env.DATABASE_URL!,
      supervise: worker,
      schedule: worker,
    });
    boss.on("error", (err) => console.error("[pg-boss]", err));
    await boss.start();
    for (const name of queueNames) await boss.createQueue(name);
    return boss;
  })();
  return globalForBoss.boss;
}

export async function enqueue<N extends QueueName>(name: N, data: JobPayloads[N], options?: SendOptions) {
  const boss = await getBoss();
  return boss.send(name, data, { retryLimit: 3, retryBackoff: true, ...options });
}
