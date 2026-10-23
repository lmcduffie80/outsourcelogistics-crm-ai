import type { Metadata } from "next";
import { FilterBar, type FilterDef } from "@/components/filter-bar";
import { PageHeader, StatCard } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireRole } from "@/lib/auth/session";
import { formatDateTime, timeAgo } from "@/lib/format";
import { listSignIns, parseSignInFilters, signInSummary } from "@/lib/sign-ins";
import { describeDevice, describeLocation } from "@/lib/sign-ins/device";

export const metadata: Metadata = { title: "Visitors" };

const rangeLabels = { "7d": "last 7 days", "30d": "last 30 days", "90d": "last 90 days", all: "all time" } as const;

const filterDefs: FilterDef[] = [
  {
    name: "range",
    label: "Date range",
    defaultValue: "30d",
    options: [
      { value: "7d", label: "Last 7 days" },
      { value: "30d", label: "Last 30 days" },
      { value: "90d", label: "Last 90 days" },
      { value: "all", label: "All time" },
    ],
  },
  {
    name: "result",
    label: "Result",
    defaultValue: "all",
    options: [
      { value: "all", label: "All attempts" },
      { value: "allowed", label: "Signed in" },
      { value: "denied", label: "Denied" },
    ],
  },
];

export default async function VisitorsPage({ searchParams }: PageProps<"/visitors">) {
  await requireRole("admin");
  const filters = parseSignInFilters(await searchParams);
  const [rows, summary] = await Promise.all([listSignIns(filters), signInSummary(filters)]);
  const period = rangeLabels[filters.range];

  return (
    <>
      <PageHeader title="Visitors" description="Everyone who has signed in to the CRM, or tried to." />

      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard label="Sign-ins" value={summary.allowed} hint={`Successful, ${period}`} tone="success" />
        <StatCard label="People" value={summary.people} hint={`Different people who signed in, ${period}`} />
        <StatCard
          label="Denied attempts"
          value={summary.denied}
          hint={`Turned away at sign-in, ${period}`}
          tone={summary.denied > 0 ? "warning" : "default"}
        />
      </div>

      <div className="mb-4">
        <FilterBar filters={filterDefs} searchPlaceholder="Search name or email" />
      </div>

      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Person</TableHead>
              <TableHead>When</TableHead>
              <TableHead>Result</TableHead>
              <TableHead>Location</TableHead>
              <TableHead>Device</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-sm text-muted-foreground">
                  No sign-ins match these filters yet.
                </TableCell>
              </TableRow>
            )}
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell>
                  <p className="font-medium">{r.name ?? r.email}</p>
                  {r.name && <p className="text-xs text-muted-foreground">{r.email}</p>}
                </TableCell>
                <TableCell>
                  <p className="text-sm">{formatDateTime(r.createdAt)}</p>
                  <p className="text-xs text-muted-foreground">{timeAgo(r.createdAt)}</p>
                </TableCell>
                <TableCell>
                  {r.allowed ? (
                    <Badge variant="secondary">Signed in</Badge>
                  ) : (
                    <Badge variant="destructive">Denied</Badge>
                  )}
                  <p className="mt-1 text-xs text-muted-foreground">
                    {r.reason ?? (r.method === "demo" ? "Demo sign-in" : "Microsoft")}
                  </p>
                </TableCell>
                <TableCell className="text-sm">
                  {describeLocation(r) ?? <span className="text-muted-foreground">Unknown</span>}
                  {r.ipAddress && <p className="font-mono text-xs text-muted-foreground">{r.ipAddress}</p>}
                </TableCell>
                <TableCell className="text-sm">{describeDevice(r.userAgent)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {rows.length === 200 && (
        <p className="mt-2 text-xs text-muted-foreground">Showing the 200 most recent. Narrow the filters to see older ones.</p>
      )}
    </>
  );
}
