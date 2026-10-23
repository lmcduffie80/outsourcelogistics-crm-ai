import { extractInquiry, draftReply } from "@/lib/ai/ollama";
import { aiProvider, aiStatus } from "@/lib/ai/provider";

const email = {
  fromName: "Dana Price",
  fromAddress: "dana@acmefoods.com",
  subject: "Need drayage + storage quote",
  body: "Hi, we have two 40ft containers of canned goods (about 38,000 lbs each) arriving at Garden City Terminal on Nov 12. Need drayage to your warehouse and food-grade storage for ~60 days. Can you also handle labeling? Thanks, Dana",
};

const status = await aiStatus();
console.log("provider:", aiProvider, "status ok:", status.ok);
const ex = await extractInquiry(email);
console.log("extract:", ex.model, "fallback:", ex.usedFallback, ex.error ?? "", JSON.stringify(ex.value));
const dr = await draftReply({
  inquiryNumber: "OL-TEST",
  customerName: "Dana Price",
  company: "Acme Foods",
  repName: "Jordan Lee",
  extraction: ex.value,
  thread: [{ direction: "inbound", sentBy: "customer", fromName: "Dana Price", bodyText: email.body, sentAt: new Date() }],
});
console.log("draft:", dr.model, "fallback:", dr.usedFallback, dr.error ?? "");
console.log(dr.value);
process.exit(0);
