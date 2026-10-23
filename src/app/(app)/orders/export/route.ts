import Papa from "papaparse";
import { auth } from "@/auth";
import { orderNumber } from "@/lib/labels";
import { listOrders, parseOrderFilters } from "@/lib/orders";

export async function GET(request: Request) {
  if (!(await auth())?.user?.id) return new Response("Unauthorized", { status: 401 });

  const sp = Object.fromEntries(new URL(request.url).searchParams);
  const rows = await listOrders(parseOrderFilters(sp));
  const csv = Papa.unparse(
    rows.map((r) => ({
      order_number: orderNumber(r.number),
      external_ref: r.externalRef ?? "",
      customer_email: r.customerEmail,
      customer_name: r.customerName,
      company: r.company ?? "",
      service_type: r.serviceType,
      status: r.status,
      value: r.value ?? "",
      booked_at: r.bookedAt.toISOString(),
      completed_at: r.completedAt?.toISOString() ?? "",
      rep_name: r.repName ?? "",
      description: r.description ?? "",
      origin: r.origin ?? "",
      destination: r.destination ?? "",
    })),
  );

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="outsource-logistics-orders-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
