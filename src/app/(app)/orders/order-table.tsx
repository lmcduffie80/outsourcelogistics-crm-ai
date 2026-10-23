"use client";

import { useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import type { OrderStatus } from "@/db/schema";
import { OrderStatusBadge, ServiceBadge } from "@/components/badges";
import { columnHelper, DataTable } from "@/components/data-table";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { formatDate, formatMoney } from "@/lib/format";
import { orderNumber, orderStatusLabels } from "@/lib/labels";
import type { OrderRow } from "@/lib/orders";
import { updateOrderStatusAction } from "./actions";

type Row = OrderRow & { editable: boolean };

function StatusCell({ row }: { row: Row }) {
  const [pending, start] = useTransition();
  if (!row.editable) return <OrderStatusBadge status={row.status} />;
  return (
    <Select
      value={row.status}
      disabled={pending}
      onValueChange={(v) =>
        start(async () => {
          const r = await updateOrderStatusAction(row.id, v);
          if (r.ok) toast.success(`${orderNumber(row.number)} marked ${orderStatusLabels[v as OrderStatus].toLowerCase()}`);
          else toast.error(r.error);
        })
      }
    >
      <SelectTrigger size="sm" className="border-0 bg-transparent px-0 shadow-none" aria-label="Order status">
        <OrderStatusBadge status={row.status} />
      </SelectTrigger>
      <SelectContent>
        {Object.entries(orderStatusLabels).map(([value, label]) => (
          <SelectItem key={value} value={value}>
            {label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

const col = columnHelper<Row>();

const columns = col.columns([
  col.accessor("number", {
    header: "Order",
    cell: ({ row }) => (
      <div className="whitespace-nowrap">
        <p className="font-semibold text-steel-800">{orderNumber(row.original.number)}</p>
        {row.original.externalRef && <p className="text-xs text-muted-foreground">{row.original.externalRef}</p>}
        {row.original.inquiryId && (
          <Link href={`/inquiries/${row.original.inquiryId}`} className="text-xs text-steel-500 hover:underline">
            View inquiry
          </Link>
        )}
      </div>
    ),
  }),
  col.accessor("customerName", {
    header: "Customer",
    cell: ({ row }) => (
      <div className="whitespace-nowrap">
        <p className="font-medium">{row.original.company ?? row.original.customerName}</p>
        {row.original.company && <p className="text-xs text-muted-foreground">{row.original.customerName}</p>}
      </div>
    ),
  }),
  col.accessor("serviceType", { header: "Service", cell: (c) => <ServiceBadge type={c.getValue()} /> }),
  col.accessor("description", {
    header: "Description",
    enableSorting: false,
    cell: ({ row }) => (
      <div className="max-w-xs">
        <p className="line-clamp-2 text-sm">{row.original.description}</p>
        {(row.original.origin || row.original.destination) && (
          <p className="mt-0.5 text-xs text-muted-foreground">
            {row.original.origin ?? "?"} → {row.original.destination ?? "?"}
          </p>
        )}
      </div>
    ),
  }),
  col.accessor((r) => r.repName ?? "", { id: "rep", header: "Rep" }),
  col.accessor("status", { header: "Status", cell: ({ row }) => <StatusCell row={row.original} /> }),
  col.accessor((r) => r.value ?? 0, {
    id: "value",
    header: "Value",
    cell: ({ row }) => <span className="font-semibold whitespace-nowrap">{formatMoney(row.original.value)}</span>,
  }),
  col.accessor("bookedAt", {
    header: "Booked",
    sortFn: "datetime",
    cell: (c) => <span className="whitespace-nowrap">{formatDate(c.getValue())}</span>,
  }),
  col.accessor((r) => r.completedAt?.getTime() ?? 0, {
    id: "completedAt",
    header: "Completed",
    cell: ({ row }) => (
      <span className="whitespace-nowrap">{row.original.completedAt ? formatDate(row.original.completedAt) : "—"}</span>
    ),
  }),
]);

export function OrderTable({ rows }: { rows: Row[] }) {
  return <DataTable columns={columns} data={rows} empty="No orders match these filters." />;
}
