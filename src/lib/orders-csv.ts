import { z } from "zod";
import { orderStatusEnum, serviceTypeEnum, type OrderStatus, type ServiceType } from "@/db/schema";

export const orderCsvColumns = [
  "external_ref",
  "customer_email",
  "customer_name",
  "company",
  "service_type",
  "status",
  "value",
  "booked_at",
  "completed_at",
  "rep_email",
  "description",
  "origin",
  "destination",
] as const;

const text = z.string().trim().optional().default("");

const rawRow = z.object({
  external_ref: z.string().trim().min(1, "external_ref is required"),
  customer_email: z.string().trim().toLowerCase().pipe(z.email("customer_email must be an email address")),
  customer_name: text,
  company: text,
  service_type: text,
  status: text,
  value: text,
  booked_at: text,
  completed_at: text,
  rep_email: text,
  description: text,
  origin: text,
  destination: text,
});

export type ParsedOrderRow = {
  externalRef: string;
  customerEmail: string;
  customerName: string;
  company: string | null;
  serviceType: ServiceType;
  status: OrderStatus;
  value: number | null;
  bookedAt: Date | null;
  completedAt: Date | null;
  repEmail: string;
  description: string | null;
  origin: string | null;
  destination: string | null;
};

const parseDate = (s: string, field: string) => {
  if (!s) return null;
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(s) ? `${s}T12:00:00` : s);
  if (Number.isNaN(d.getTime())) throw new Error(`${field} "${s}" is not a valid date`);
  return d;
};

/** Validates one CSV row; throws with a readable message on bad input. */
export function parseOrderRow(raw: Record<string, string>): ParsedOrderRow {
  const r = rawRow.safeParse(raw);
  if (!r.success) throw new Error(r.error.issues[0].message);
  const v = r.data;
  const value = v.value ? Number(v.value.replace(/[$,]/g, "")) : null;
  if (value !== null && !Number.isFinite(value)) throw new Error(`value "${v.value}" is not a number`);
  const service = v.service_type.toLowerCase().replace(/[\s-]+/g, "_");
  const status = v.status.toLowerCase().replace(/[\s-]+/g, "_");
  return {
    externalRef: v.external_ref,
    customerEmail: v.customer_email,
    customerName: v.customer_name || v.customer_email.split("@")[0],
    company: v.company || null,
    serviceType: (serviceTypeEnum.enumValues as readonly string[]).includes(service) ? (service as ServiceType) : "other",
    status: (orderStatusEnum.enumValues as readonly string[]).includes(status) ? (status as OrderStatus) : "completed",
    value,
    bookedAt: parseDate(v.booked_at, "booked_at"),
    completedAt: parseDate(v.completed_at, "completed_at"),
    repEmail: v.rep_email.toLowerCase(),
    description: v.description || null,
    origin: v.origin || null,
    destination: v.destination || null,
  };
}
