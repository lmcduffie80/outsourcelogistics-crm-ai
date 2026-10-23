"use client";

import Link from "next/link";
import { columnHelper, DataTable } from "@/components/data-table";
import { formatDuration, formatMoney, formatPercent } from "@/lib/format";
import type { RepMetrics } from "@/lib/metrics";
import { cn } from "@/lib/utils";

const col = columnHelper<RepMetrics>();

const num = (v: number | null) => v ?? -1;

function Compliance({ value }: { value: number | null }) {
  if (value === null) return <span className="text-muted-foreground">—</span>;
  const tone = value >= 0.9 ? "bg-svc-port" : value >= 0.75 ? "bg-svc-transportation" : "bg-svc-value";
  return (
    <div className="flex min-w-28 items-center gap-2">
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
        <div className={cn("h-full rounded-full", tone)} style={{ width: `${Math.round(value * 100)}%` }} />
      </div>
      <span className="w-9 text-right text-xs font-semibold">{formatPercent(value)}</span>
    </div>
  );
}

function buildColumns(slaMinutes: number, range: string) {
  return col.columns([
    col.accessor("name", {
      header: "Rep",
      cell: ({ row }) => (
        <Link
          href={`/manager/reps/${row.original.repId}?range=${range}`}
          className="font-semibold whitespace-nowrap text-steel-800 hover:underline"
          onClick={(e) => e.stopPropagation()}
        >
          {row.original.name}
          {!row.original.active && <span className="ml-1 text-xs text-muted-foreground">(inactive)</span>}
        </Link>
      ),
    }),
    col.accessor("open", { header: "Open now" }),
    col.accessor("received", { header: "Received" }),
    col.accessor((r) => num(r.firstResponseMedian), {
      id: "median",
      header: "Median 1st response",
      cell: ({ row }) => {
        const v = row.original.firstResponseMedian;
        return (
          <span className={cn("font-semibold", v !== null && v > slaMinutes ? "text-svc-value" : "text-svc-port")}>
            {formatDuration(v)}
          </span>
        );
      },
    }),
    col.accessor((r) => num(r.replyAvg), {
      id: "replyAvg",
      header: "Avg reply time",
      cell: ({ row }) => formatDuration(row.original.replyAvg),
    }),
    col.accessor((r) => num(r.slaCompliance), {
      id: "sla",
      header: "SLA met",
      cell: ({ row }) => <Compliance value={row.original.slaCompliance} />,
    }),
    col.accessor("slaBreaches", {
      header: "Breaches",
      cell: (c) => <span className={cn(c.getValue() > 0 && "font-semibold text-svc-value")}>{c.getValue()}</span>,
    }),
    col.accessor("repliesSent", { header: "Replies" }),
    col.accessor((r) => num(r.aiEditRatio), {
      id: "aiEdit",
      header: "AI draft edits",
      cell: ({ row }) => (
        <span title={`${row.original.aiDraftsUsed} replies sent from AI drafts`}>
          {formatPercent(row.original.aiEditRatio)}
        </span>
      ),
    }),
    col.accessor("ordersCompleted", { header: "Orders done" }),
    col.accessor("revenueCompleted", { header: "Revenue", cell: (c) => formatMoney(c.getValue()) }),
    col.accessor((r) => num(r.conversionRate), {
      id: "conversion",
      header: "Win rate",
      cell: ({ row }) => formatPercent(row.original.conversionRate),
    }),
  ]);
}

export function RepTable({ reps, slaMinutes, range }: { reps: RepMetrics[]; slaMinutes: number; range: string }) {
  return (
    <DataTable
      columns={buildColumns(slaMinutes, range)}
      data={reps}
      initialSorting={[{ id: "median", desc: false }]}
      onRowHref={(r) => `/manager/reps/${r.repId}?range=${range}`}
      empty="No reps yet."
    />
  );
}
