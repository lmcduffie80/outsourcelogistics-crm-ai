import { serviceTypeLabels } from "@/lib/labels";
import type { InquiryExtraction } from "./schemas";
import type { DraftInput, EmailInput } from "./ollama";

/**
 * Keyword-based extraction used when the AI model is unreachable, so new
 * mail still becomes an inquiry and gets acknowledged.
 */
export function heuristicExtraction(email: EmailInput): InquiryExtraction {
  const text = `${email.subject}\n${email.body}`.toLowerCase();
  // Words match at a word start, so "port" doesn't fire on "transport" or "support".
  const has = (...words: string[]) =>
    words.some((w) => new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`).test(text));

  const serviceType: InquiryExtraction["serviceType"] = has("transload", "flat rack", "flatrack")
    ? "transloading"
    : has("drayage", "container", "terminal", "port", "demurrage", "per diem")
      ? "port_services"
      : has("kitting", "kit ", "relabel", "labeling", "packaging")
        ? "value_added"
        : has("warehous", "storage", "pallet position", "pick/pack", "fulfillment")
          ? "warehousing"
          : has("ftl", "ltl", "truck", "lane", "freight", "dry van", "flatbed")
            ? "transportation"
            : "other";

  const weight = email.body.match(/\b[\d,.]+\s?(lbs?|pounds|kg|tons?)\b/i)?.[0] ?? null;
  const signatureName = email.fromName?.trim() || null;

  return {
    isCustomerInquiry: !has("unsubscribe", "out of office", "automatic reply"),
    customerName: signatureName,
    company: null,
    phone: email.body.match(/\(?\d{3}\)?[ .-]\d{3}[ .-]\d{4}/)?.[0] ?? null,
    serviceType,
    priority: has("urgent", "asap", "today", "tomorrow") ? "urgent" : "normal",
    summary: email.subject,
    origin: null,
    destination: null,
    commodity: null,
    weight,
    volume: null,
    hazmat: has("hazmat", "haz mat", "hazardous", "class 3", "class 8", "un number"),
    foodGrade: has("food grade", "food-grade", "fda"),
    requestedDate: null,
    questions: [],
  };
}

export function templateReply(input: DraftInput): string {
  const first = input.customerName.split(" ")[0] || "there";
  const service = input.extraction ? serviceTypeLabels[input.extraction.serviceType].toLowerCase() : "logistics";
  const repFirst = input.repName.split(" ")[0];
  return `Hi ${first},

Thank you for reaching out to Outsource Logistics about your ${service} needs. I'm reviewing the details you sent and will confirm availability and pricing.

To finalize a quote, could you confirm any details we're missing, such as origin, destination, commodity, weight, and your target dates?

Best regards,
${repFirst}`;
}
