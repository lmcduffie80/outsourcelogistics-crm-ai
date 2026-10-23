import { describe, expect, it } from "vitest";
import { parseOrderRow } from "./orders-csv";

describe("parseOrderRow", () => {
  it("normalizes labels, money, and dates", () => {
    const r = parseOrderRow({
      external_ref: " TMS-1 ",
      customer_email: "Ops@NewCo.com",
      service_type: "Port Services",
      status: "In Progress",
      value: "$2,450.50",
      booked_at: "2026-10-01",
    });
    expect(r).toMatchObject({
      externalRef: "TMS-1",
      customerEmail: "ops@newco.com",
      customerName: "ops",
      serviceType: "port_services",
      status: "in_progress",
      value: 2450.5,
      completedAt: null,
    });
    expect(r.bookedAt?.getDate()).toBe(1);
  });

  it("defaults unknown service to other and missing status to completed", () => {
    const r = parseOrderRow({ external_ref: "A", customer_email: "a@b.com", service_type: "rail" });
    expect(r.serviceType).toBe("other");
    expect(r.status).toBe("completed");
  });

  it.each([
    [{ external_ref: "", customer_email: "a@b.com" }, "external_ref is required"],
    [{ external_ref: "A", customer_email: "nope" }, "customer_email must be an email address"],
    [{ external_ref: "A", customer_email: "a@b.com", value: "lots" }, 'value "lots" is not a number'],
    [{ external_ref: "A", customer_email: "a@b.com", booked_at: "someday" }, 'booked_at "someday" is not a valid date'],
  ])("rejects %j", (row, message) => {
    expect(() => parseOrderRow(row)).toThrow(message);
  });
});
