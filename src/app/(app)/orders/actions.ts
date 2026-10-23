"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import Papa from "papaparse";
import { z } from "zod";
import { db } from "@/db";
import { activityLog, customers, orderStatusEnum, orders } from "@/db/schema";
import { getCurrentUser, isManager } from "@/lib/auth/session";
import { parseOrderRow, type ParsedOrderRow } from "@/lib/orders-csv";

export type ActionResult = { ok: true; message?: string } | { ok: false; error: string };

export async function updateOrderStatusAction(orderId: string, status: string): Promise<ActionResult> {
  const user = await getCurrentUser();
  const parsed = z.enum(orderStatusEnum.enumValues).safeParse(status);
  if (!parsed.success) return { ok: false, error: "Invalid status" };
  const order = await db.query.orders.findFirst({ where: eq(orders.id, orderId) });
  if (!order) return { ok: false, error: "Order not found" };
  if (!isManager(user) && order.repId !== user.id) return { ok: false, error: "This order belongs to another rep" };

  await db
    .update(orders)
    .set({
      status: parsed.data,
      completedAt: parsed.data === "completed" ? (order.completedAt ?? new Date()) : null,
    })
    .where(eq(orders.id, orderId));
  await db.insert(activityLog).values({
    orderId,
    inquiryId: order.inquiryId,
    userId: user.id,
    type: "order.status",
    details: { status: parsed.data },
  });
  revalidatePath("/orders");
  return { ok: true, message: "Order updated" };
}

/** Imports historical/legacy orders from CSV. Rows are upserted by external_ref. */
export async function importOrdersAction(formData: FormData): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!isManager(user)) return { ok: false, error: "Only managers can import orders" };
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Choose a CSV file" };
  if (file.size > 5_000_000) return { ok: false, error: "CSV must be under 5 MB" };

  const parsed = Papa.parse<Record<string, string>>(await file.text(), {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim().toLowerCase().replace(/\s+/g, "_"),
  });
  if (parsed.errors.length) return { ok: false, error: `CSV error on row ${(parsed.errors[0].row ?? 0) + 2}: ${parsed.errors[0].message}` };

  const rows: ParsedOrderRow[] = [];
  for (const [i, raw] of parsed.data.entries()) {
    try {
      rows.push(parseOrderRow(raw));
    } catch (err) {
      return { ok: false, error: `Row ${i + 2}: ${(err as Error).message}` };
    }
  }
  if (!rows.length) return { ok: false, error: "The CSV has no rows" };

  const staff = await db.query.users.findMany({ columns: { id: true, email: true } });
  const repByEmail = new Map(staff.map((s) => [s.email, s.id]));
  let created = 0;
  let updated = 0;

  await db.transaction(async (tx) => {
    for (const r of rows) {
      const [customer] = await tx
        .insert(customers)
        .values({ email: r.customerEmail, name: r.customerName, company: r.company })
        .onConflictDoUpdate({ target: customers.email, set: { email: r.customerEmail } })
        .returning({ id: customers.id });
      const values = {
        externalRef: r.externalRef,
        customerId: customer.id,
        repId: repByEmail.get(r.repEmail) ?? null,
        serviceType: r.serviceType,
        status: r.status,
        value: r.value,
        description: r.description,
        origin: r.origin,
        destination: r.destination,
        bookedAt: r.bookedAt ?? r.completedAt ?? new Date(),
        completedAt: r.status === "completed" ? (r.completedAt ?? r.bookedAt ?? new Date()) : r.completedAt,
      };
      const existing = await tx.query.orders.findFirst({
        where: eq(orders.externalRef, r.externalRef),
        columns: { id: true },
      });
      if (existing) {
        await tx.update(orders).set(values).where(eq(orders.id, existing.id));
        updated++;
      } else {
        await tx.insert(orders).values(values);
        created++;
      }
    }
    await tx.insert(activityLog).values({
      userId: user.id,
      type: "orders.imported",
      details: { created, updated, file: file.name },
    });
  });

  revalidatePath("/orders");
  revalidatePath("/manager");
  return { ok: true, message: `Imported ${created} new and updated ${updated} existing orders` };
}
