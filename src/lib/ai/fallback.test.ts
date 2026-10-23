import { describe, expect, it } from "vitest";
import { heuristicExtraction, templateReply } from "./fallback";

const email = (subject: string, body = "") => ({ fromName: "Pat Reynolds", fromAddress: "pat@acme.com", subject, body });

describe("heuristicExtraction", () => {
  it.each([
    ["Drayage quote from Garden City Terminal", "port_services"],
    ["Need LTL transportation to Atlanta", "transportation"],
    ["Flat rack transload of steel coils", "transloading"],
    ["Pallet storage for 60 days", "warehousing"],
    ["Kitting and relabeling project", "value_added"],
    ["Question about our account support", "other"],
  ])("classifies %j as %s", (subject, expected) => {
    expect(heuristicExtraction(email(subject)).serviceType).toBe(expected);
  });

  it("flags hazmat, urgency, weight, and phone", () => {
    const r = heuristicExtraction(
      email("URGENT storage", "We need Class 8 hazmat space ASAP for 44,000 lbs. Call (912) 555-0199."),
    );
    expect(r).toMatchObject({ hazmat: true, priority: "urgent", weight: "44,000 lbs", phone: "(912) 555-0199" });
  });

  it("treats auto-replies as non-inquiries", () => {
    expect(heuristicExtraction(email("Automatic reply: Out of office")).isCustomerInquiry).toBe(false);
  });
});

describe("templateReply", () => {
  it("greets the customer by first name and signs with the rep's first name", () => {
    const text = templateReply({
      inquiryNumber: "INQ-1",
      customerName: "Pat Reynolds",
      company: null,
      repName: "Maria Santos",
      extraction: heuristicExtraction(email("Drayage quote")),
      thread: [],
    });
    expect(text.startsWith("Hi Pat,")).toBe(true);
    expect(text).toContain("port services");
    expect(text.trim().endsWith("Maria")).toBe(true);
  });
});
