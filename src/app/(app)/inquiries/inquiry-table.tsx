"use client";

import Link from "next/link";
import { Clock } from "lucide-react";
import { PriorityBadge, ServiceBadge, StatusBadge } from "@/components/badges";
import { columnHelper, DataTable } from "@/components/data-table";
import { formatDuration, timeAgo } from "@/lib/format";
import { inquiryNumber } from "@/lib/labels";
import type { InquiryRow } from "@/lib/inquiries/queries";
import { cn } from "@/lib/utils";

const col = columnHelper<InquiryRow>();

const priorityRank = { urgent: 3, high: 2, normal: 1, low: 0 } as const;

const columns = col.columns([
  col.accessor("number", {
    header: "Inquiry",
    cell: ({ row }) => (
      <div className="max-w-md min-w-56">
        <Link
          href={`/inquiries/${row.original.id}`}
          className="font-semibold text-steel-800 hover:underline"
          onClick={(e) => e.stopPropagation()}
        >
          {inquiryNumber(row.original.number)} · {row.original.subject}
        </Link>
        {row.original.summary && (
          <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{row.original.summary}</p>
        )}
      </div>
    ),
  }),
  col.accessor("customerName", {
    header: "Customer",
    cell: ({ row }) => (
      <div className="whitespace-nowrap">
        <p className="font-medium">{row.original.customerName}</p>
        <p className="text-xs text-muted-foreground">{row.original.company}</p>
      </div>
    ),
  }),
  col.accessor("serviceType", { header: "Service", cell: (c) => <ServiceBadge type={c.getValue()} /> }),
  col.accessor((r) => priorityRank[r.priority], {
    id: "priority",
    header: "Priority",
    cell: ({ row }) => <PriorityBadge priority={row.original.priority} />,
  }),
  col.accessor("status", { header: "Status", cell: (c) => <StatusBadge status={c.getValue()} /> }),
  col.accessor((r) => r.repName ?? "", {
    id: "rep",
    header: "Rep",
    cell: ({ row }) => (
      <span className="whitespace-nowrap">{row.original.repName ?? <em className="text-muted-foreground">Unassigned</em>}</span>
    ),
  }),
  col.accessor("receivedAt", {
    header: "Received",
    sortFn: "datetime",
    cell: (c) => <span className="whitespace-nowrap text-muted-foreground">{timeAgo(c.getValue())}</span>,
  }),
  col.accessor((r) => r.waitingMinutes ?? -1, {
    id: "waiting",
    header: "Waiting",
    cell: ({ row }) =>
      row.original.waitingMinutes === null ? (
        <span className="text-muted-foreground">—</span>
      ) : (
        <span
          className={cn(
            "inline-flex items-center gap-1 font-semibold whitespace-nowrap",
            row.original.slaBreached ? "text-svc-value" : "text-steel-700",
          )}
        >
          <Clock className="size-3.5" />
          {formatDuration(row.original.waitingMinutes)}
        </span>
      ),
  }),
]);

export function InquiryTable({ rows }: { rows: InquiryRow[] }) {
  return (
    <DataTable
      columns={columns}
      data={rows}
      empty="No inquiries match these filters."
      onRowHref={(r) => `/inquiries/${r.id}`}
      rowClassName={(r) => (r.slaBreached ? "bg-svc-value/[0.04]" : undefined)}
    />
  );
}
