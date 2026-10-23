import { generateText, Output } from "ai";
import { getSetting } from "@/lib/settings";
import { serviceTypeLabels } from "@/lib/labels";
import { inquiryExtractionSchema, type InquiryExtraction } from "./schemas";
import { heuristicExtraction, templateReply } from "./fallback";
import { languageModel, temperature } from "./provider";

export { aiStatus } from "./provider";

export type EmailInput = {
  fromName: string | null;
  fromAddress: string;
  subject: string;
  body: string;
};

export type AiResult<T> = { value: T; model: string; usedFallback: boolean; error?: string };

async function currentModel() {
  return (await getSetting("ai")).model;
}

const extractionSystem = `You are an intake assistant for Outsource Logistics, a third-party logistics (3PL) provider in Savannah, Georgia offering warehousing (including food-grade and hazmat dry storage), Port of Savannah services (drayage, container pickup), oversized flat rack transloading, value-added services (kitting, labeling), and trucking throughout the Southeast.

Read the customer email and extract the requested fields. Use null when a value is not stated. Never invent details.`;

export async function extractInquiry(email: EmailInput): Promise<AiResult<InquiryExtraction>> {
  const model = await currentModel();
  try {
    const { output } = await generateText({
      model: languageModel(model),
      system: extractionSystem,
      output: Output.object({ schema: inquiryExtractionSchema }),
      prompt: `From: ${email.fromName ?? ""} <${email.fromAddress}>\nSubject: ${email.subject}\n\n${email.body.slice(0, 8000)}`,
      temperature: temperature(0),
      maxRetries: 1,
    });
    return { value: output, model, usedFallback: false };
  } catch (err) {
    return {
      value: heuristicExtraction(email),
      model: "heuristic",
      usedFallback: true,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export type DraftInput = {
  inquiryNumber: string;
  customerName: string;
  company: string | null;
  repName: string;
  extraction: InquiryExtraction | null;
  thread: { direction: "inbound" | "outbound"; sentBy: string; fromName: string | null; bodyText: string; sentAt: Date }[];
};

export async function draftReply(input: DraftInput): Promise<AiResult<string>> {
  const [model, ai] = [await currentModel(), await getSetting("ai")];
  const transcript = input.thread
    .map(
      (m) =>
        `--- ${m.direction === "inbound" ? "CUSTOMER" : m.sentBy === "system" ? "AUTO-ACKNOWLEDGMENT" : "OUTSOURCE LOGISTICS"} (${m.fromName ?? ""}, ${m.sentAt.toISOString()}) ---\n${m.bodyText.slice(0, 4000)}`,
    )
    .join("\n\n");
  const facts = input.extraction
    ? `Service: ${serviceTypeLabels[input.extraction.serviceType]}\nOrigin: ${input.extraction.origin ?? "unknown"}\nDestination: ${input.extraction.destination ?? "unknown"}\nCommodity: ${input.extraction.commodity ?? "unknown"}\nWeight: ${input.extraction.weight ?? "unknown"}\nVolume: ${input.extraction.volume ?? "unknown"}\nHazmat: ${input.extraction.hazmat}\nFood grade: ${input.extraction.foodGrade}\nRequested date: ${input.extraction.requestedDate ?? "unknown"}\nQuestions to answer: ${input.extraction.questions.join("; ") || "none"}`
    : "No structured details available.";

  try {
    const { text } = await generateText({
      model: languageModel(model),
      system: `You write email replies for ${input.repName}, a customer service representative at Outsource Logistics (Savannah, GA 3PL: warehousing, Port of Savannah services, transloading, value-added services, Southeast trucking). Phone: (866) 726-2715.

Guidelines:
${ai.replyGuidelines}

Write only the email body: greeting through sign-off with the rep's first name. No subject line, no placeholders like [Name], no markdown.`,
      prompt: `Inquiry ${input.inquiryNumber} from ${input.customerName}${input.company ? ` (${input.company})` : ""}.

Extracted details:
${facts}

Conversation so far (oldest first):
${transcript}

Write the next reply to the customer's most recent message.`,
      temperature: temperature(0.4),
      maxRetries: 1,
    });
    return { value: text.trim(), model, usedFallback: false };
  } catch (err) {
    return {
      value: templateReply(input),
      model: "template",
      usedFallback: true,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
