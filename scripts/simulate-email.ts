/**
 * Simulates an email arriving in the shared mailbox and runs the full pipeline
 * inline (extract -> inquiry -> acknowledgment -> AI draft), without Microsoft 365.
 *
 *   pnpm mail:simulate
 *   pnpm mail:simulate --from jane@acme.com --name "Jane Doe" --subject "Need drayage" --body "..."
 *   pnpm mail:simulate --reply 1042 --from jane@acme.com --body "Can we book it?"
 *   pnpm mail:simulate --queue   # hand the acknowledgment and draft to a running worker
 */
import { randomUUID } from "node:crypto";
import { parseArgs } from "node:util";
import { mailbox } from "@/lib/graph/client";
import { enqueue, getBoss } from "@/lib/jobs";
import { generateDraft, ingestEmail, sendAcknowledgment } from "@/lib/inquiries/service";

const { values } = parseArgs({
  options: {
    from: { type: "string", default: "pat.reynolds@harborviewimports.com" },
    name: { type: "string", default: "Pat Reynolds" },
    subject: { type: "string", default: "Quote request: 2x40' containers to Statesboro + 30 days storage" },
    body: {
      type: "string",
      default: `Hello Outsource Logistics team,

We have two 40' standard containers of ceramic tile (about 44,000 lbs each) arriving at Garden City Terminal on the 28th. We'd like you to pick them up, unload into your warehouse, and store the product for roughly 30 days before delivering to a customer in Statesboro, GA.

Can you quote drayage, storage per pallet per month, and final delivery? Also, what are your receiving hours?

Thanks,
Pat Reynolds
Harborview Imports
(912) 555-0199`,
    },
    reply: { type: "string" },
    queue: { type: "boolean", default: false },
  },
});

const subject = values.reply ? `RE: Follow-up [INQ-${values.reply}]` : values.subject!;

const result = await ingestEmail({
  graphMessageId: null,
  internetMessageId: `<sim-${randomUUID()}@${values.from!.split("@")[1]}>`,
  conversationId: null,
  fromAddress: values.from!.toLowerCase(),
  fromName: values.name!,
  toAddresses: [mailbox()],
  subject,
  bodyText: values.body!,
  receivedAt: new Date(),
});
console.log("ingest:", result);

if (values.queue && (result.kind === "created" || result.kind === "appended")) {
  if (result.kind === "created") await enqueue("send-ack", { inquiryId: result.inquiryId }, { singletonKey: result.inquiryId });
  await enqueue("draft-reply", { inquiryId: result.inquiryId });
  console.log("queued send-ack/draft-reply for the worker");
  await (await getBoss()).stop({ graceful: true });
  process.exit(0);
}

if (result.kind === "created") {
  console.log("ack:", await sendAcknowledgment(result.inquiryId));
}
if (result.kind === "created" || result.kind === "appended") {
  const draft = await generateDraft(result.inquiryId);
  console.log(`draft (${draft.draft.model}${draft.usedFallback ? ", fallback" : ""}):\n${draft.draft.generatedText}`);
  if (draft.error) console.log("AI error:", draft.error);
}
process.exit(0);
