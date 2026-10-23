import type { Metadata } from "next";
import { format, parseISO } from "date-fns";
import { Download } from "lucide-react";
import { FilterBar, type FilterDef } from "@/components/filter-bar";
import { PageHeader, StatCard } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getCurrentUser, isManager } from "@/lib/auth/session";
import { formatMoney } from "@/lib/format";
import { listActiveStaff } from "@/lib/inquiries/queries";
import { orderStatusLabels, serviceTypeLabels } from "@/lib/labels";
import { listOrders, parseOrderFilters, totalsByMonth } from "@/lib/orders";
import { ImportOrdersDialog } from "./import-dialog";
import { OrderTable } from "./order-table";

export const metadata: Metadata = { title: "Orders" };

export default async function OrdersPage({ searchParams }: PageProps<"/orders">) {
  const user = await getCurrentUser();
  const sp = await searchParams;
  const filters = parseOrderFilters(sp);
  const [rows, staff] = await Promise.all([listOrders(filters), listActiveStaff()]);
  const manager = isManager(user);

  const totalValue = rows.reduce((a, r) => a + (r.value ?? 0), 0);
  const months = totalsByMonth(rows);
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

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatCard label={completedView ? "Orders completed" : "Orders"} value={rows.length} tone="success" />
        <StatCard label="Total value" value={formatMoney(totalValue)} />
        <StatCard label="Average order" value={formatMoney(rows.length ? totalValue / rows.length : null)} />
      </div>

      <div className="mb-4">
        <FilterBar filters={filterDefs} searchPlaceholder="Search customer, ORD #, reference" />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_280px]">
        <OrderTable rows={rows.map((r) => ({ ...r, editable: manager || r.repId === user.id }))} />
        <Card className="h-fit">
          <CardHeader>
            <CardTitle className="font-heading text-base">{completedView ? "Completed by month" : "By month"}</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Month</TableHead>
                  <TableHead className="text-right">Orders</TableHead>
                  <TableHead className="text-right">Value</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {months.map((m) => (
                  <TableRow key={m.month}>
                    <TableCell>{format(parseISO(`${m.month}-01`), "MMM yyyy")}</TableCell>
                    <TableCell className="text-right">{m.count}</TableCell>
                    <TableCell className="text-right">{formatMoney(m.revenue)}</TableCell>
                  </TableRow>
                ))}
                {months.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center text-muted-foreground">
                      No orders
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
