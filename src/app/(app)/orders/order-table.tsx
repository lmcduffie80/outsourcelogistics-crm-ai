"use client";

import { useTransition } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { toast } from "sonner";
import type { OrderStatus } from "@/db/schema";
import { OrderStatusBadge, ServiceBadge } from "@/components/badges";
import { columnHelper, DataTable } from "@/components/data-table";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { formatDate } from "@/lib/format";
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
        {row.original.inquiryId ? (
          <Link
            href={`/inquiries/${row.original.inquiryId}`}
            className="font-semibold text-steel-800 hover:underline"
            title="Open the inquiry this order came from"
          >
            {orderNumber(row.original.number)}
          </Link>
        ) : (
          <p className="font-semibold text-steel-800">{orderNumber(row.original.number)}</p>
        )}
        {row.original.externalRef && <p className="text-xs text-muted-foreground">{row.original.externalRef}</p>}
      </div>
    ),
  }),
  col.accessor((r) => r.company ?? r.customerName, {
    id: "customer",
    header: "Customer",
    cell: ({ row }) => (
      <div className="max-w-40">
        <p className="truncate font-medium">{row.original.company ?? row.original.customerName}</p>
        {row.original.company && <p className="truncate text-xs text-muted-foreground">{row.original.customerName}</p>}
      </div>
    ),
  }),
  col.accessor("serviceType", {
    header: "Service & details",
    cell: ({ row }) => {
      const route = [row.original.origin, row.original.destination].filter(Boolean).join(" → ");
      return (
        <div className="max-w-68 min-w-56 space-y-1">
          <div className="flex items-center gap-2">
            <ServiceBadge type={row.original.serviceType} />
            <p className="min-w-0 truncate text-sm" title={row.original.description ?? undefined}>
              {row.original.description}
            </p>
          </div>
          {route && (
            <p className="truncate text-xs text-muted-foreground" title={route}>
              {route}
            </p>
          )}
        </div>
      );
    },
  }),
  col.accessor((r) => r.repName ?? "", {
    id: "rep",
    header: "Rep",
    cell: (c) => <span className="whitespace-nowrap">{c.getValue() || "—"}</span>,
  }),
  col.accessor("status", { header: "Status", cell: ({ row }) => <StatusCell row={row.original} /> }),
  col.accessor((r) => (r.completedAt ?? r.bookedAt).getTime(), {
    id: "date",
    header: "Date",
    cell: ({ row }) => {
      const { completedAt, bookedAt } = row.original;
      return (
        <div className="whitespace-nowrap">
          <p>{formatDate(completedAt ?? bookedAt)}</p>
          <p className="text-xs text-muted-foreground">
            {completedAt ? `Booked ${format(bookedAt, "MMM d")}` : "Booked"}
          </p>
        </div>
      );
    },
  }),
]);

export function OrderTable({ rows }: { rows: Row[] }) {
  return (
    <DataTable
      columns={columns}
      data={rows}
      initialSorting={[{ id: "date", desc: true }]}
      empty="No orders match these filters."
    />
  );
}
