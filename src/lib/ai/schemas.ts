import { z } from "zod";

export const serviceTypes = [
  "warehousing",
  "transportation",
  "port_services",
  "transloading",
  "value_added",
  "other",
] as const;

export const priorities = ["low", "normal", "high", "urgent"] as const;

export const inquiryExtractionSchema = z.object({
  isCustomerInquiry: z
    .boolean()
    .describe("False for spam, newsletters, auto-replies, or internal mail; true for a customer request."),
  customerName: z.string().nullable().describe("Full name of the person writing, if stated or in the signature."),
  company: z.string().nullable().describe("The customer's company name, if stated or in the signature."),
  phone: z.string().nullable(),
  serviceType: z.enum(serviceTypes).describe(
    "warehousing = storage/fulfillment; transportation = trucking/FTL/LTL; port_services = drayage/container pickup at the Port of Savannah; transloading = moving freight between containers/flat racks/trucks; value_added = kitting/labeling/packaging; other = anything else.",
  ),
  priority: z.enum(priorities).describe("urgent only if the customer states a same-day or next-day deadline."),
  summary: z.string().describe("One or two sentence plain-English summary of what the customer needs."),
  origin: z.string().nullable(),
  destination: z.string().nullable(),
  commodity: z.string().nullable(),
  weight: z.string().nullable().describe("Weight with units as written, e.g. '42,000 lbs'."),
  volume: z.string().nullable().describe("Pallet count, container count/size, or cubic volume as written."),
  hazmat: z.boolean(),
  foodGrade: z.boolean(),
  requestedDate: z.string().nullable().describe("Requested pickup/delivery/start date as written."),
  questions: z.array(z.string()).describe("Specific questions the customer asked that the reply must answer."),
});

export type InquiryExtraction = z.infer<typeof inquiryExtractionSchema>;
