import type { Metadata } from "next";
import { format, parseISO } from "date-fns";
import { Download } from "lucide-react";
import { FilterBar, type FilterDef } from "@/components/filter-bar";
import { PageHeader, StatCard } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { getCurrentUser, isManager } from "@/lib/auth/session";
import { formatDuration } from "@/lib/format";
import { listActiveStaff } from "@/lib/inquiries/queries";
import { orderStatusLabels, serviceTypeLabels } from "@/lib/labels";
import { median } from "@/lib/metrics";
import { countsByMonth, listOrders, orderCounts, parseOrderFilters } from "@/lib/orders";
import { getSetting } from "@/lib/settings";
import { ImportOrdersDialog } from "./import-dialog";
import { OrderTable } from "./order-table";

export const metadata: Metadata = { title: "Orders" };

export default async function OrdersPage({ searchParams }: PageProps<"/orders">) {
  const user = await getCurrentUser();
  const sp = await searchParams;
  const filters = parseOrderFilters(sp);
  const [rows, staff, counts, sla] = await Promise.all([
    listOrders(filters),
    listActiveStaff(),
    orderCounts(filters),
    getSetting("sla"),
  ]);
  const manager = isManager(user);

  const responseMinutes = rows.flatMap((r) =>
    r.inquiryReceivedAt && r.inquiryFirstResponseAt
      ? [(r.inquiryFirstResponseAt.getTime() - r.inquiryReceivedAt.getTime()) / 60_000]
      : [],
  );
  const medianResponse = median(responseMinutes);
  const months = countsByMonth(rows);
  const completedView = filters.status === "completed";
  const exportQuery = new URLSearchParams(
    Object.entries(sp).filter((e): e is [string, string] => typeof e[1] === "string"),
  ).toString();

  const filterDefs: FilterDef[] = [
    {
      name: "status",
      label: "Status",
      defaultValue: "completed",
      options: [
        { value: "all", label: "All statuses" },
        ...Object.entries(orderStatusLabels).map(([value, label]) => ({ value, label })),
      ],
    },
    {
      name: "range",
      label: "Date range",
      defaultValue: "90d",
      options: [
        { value: "30d", label: "Last 30 days" },
        { value: "90d", label: "Last 90 days" },
        { value: "365d", label: "Last 12 months" },
        { value: "all", label: "All time" },
      ],
    },
    {
      name: "rep",
      label: "Rep",
      defaultValue: "all",
      options: [
        { value: "all", label: "All reps" },
        ...staff.filter((s) => s.role === "rep").map((s) => ({ value: s.id, label: s.name })),
      ],
    },
    {
      name: "service",
      label: "Service",
      defaultValue: "any",
      options: [
        { value: "any", label: "All services" },
        ...Object.entries(serviceTypeLabels).map(([value, label]) => ({ value, label })),
      ],
    },
  ];

  return (
    <>
      <PageHeader
        title="Orders"
        description={
          completedView
            ? "Completed orders, by completion date."
            : "Orders booked from inquiries or imported from your portals, by booking date."
        }
        actions={
          <>
            {manager && <ImportOrdersDialog />}
            <Button variant="outline" asChild>
              <a href={`/orders/export${exportQuery ? `?${exportQuery}` : ""}`}>
                <Download />
                Export CSV
              </a>
            </Button>
          </>
        }
      />

      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard label="Orders completed" value={counts.completed} tone="success" />
        <StatCard label="Open orders" value={counts.open} hint="Booked or in progress" />
        <StatCard
          label="Time to respond"
          value={formatDuration(medianResponse)}
          hint={`Median first reply on these orders · target ${formatDuration(sla.firstResponseMinutes)}`}
          tone={medianResponse !== null && medianResponse > sla.firstResponseMinutes ? "danger" : "default"}
        />
      </div>

      <div className="mb-4">
        <FilterBar filters={filterDefs} searchPlaceholder="Search customer, ORD #, reference" />
      </div>

      {months.length > 0 && (
        <section className="mb-4" aria-label={completedView ? "Completed by month" : "Orders by month"}>
          <h2 className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            {completedView ? "Completed by month" : "Booked by month"}
          </h2>
          <div className="flex gap-3 overflow-x-auto pb-1">
            {months.map((m) => (
              <div key={m.month} className="min-w-36 shrink-0 rounded-lg border bg-card px-4 py-3">
                <p className="text-xs font-semibold text-steel-700">{format(parseISO(`${m.month}-01`), "MMM yyyy")}</p>
                <p className="mt-1 font-heading text-xl text-steel-900 tabular-nums">{m.count}</p>
                <p className="text-xs text-muted-foreground">{m.count === 1 ? "order" : "orders"}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      <OrderTable rows={rows.map((r) => ({ ...r, editable: manager || r.repId === user.id }))} />
    </>
  );
}
