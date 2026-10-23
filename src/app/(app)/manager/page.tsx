import type { Metadata } from "next";
import { FilterBar } from "@/components/filter-bar";
import { PageHeader, StatCard } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireRole } from "@/lib/auth/session";
import { formatDuration, formatMoney, formatPercent } from "@/lib/format";
import { parseRange, teamMetrics } from "@/lib/metrics";
import { ResponseTrendChart, VolumeChart } from "./charts";
import { rangeFilter } from "./range-filter";
import { RepTable } from "./rep-table";

export const metadata: Metadata = { title: "Team Dashboard" };


export default async function ManagerPage({ searchParams }: PageProps<"/manager">) {
  await requireRole("manager", "admin");
  const range = parseRange((await searchParams).range);
  const { reps, summary, trend, sla } = await teamMetrics(range);

  return (
    <>
      <PageHeader
        title="Team Dashboard"
        description={`How quickly customer service reps answer customers. Response targets: first reply within ${formatDuration(sla.firstResponseMinutes)}, follow-ups within ${formatDuration(sla.followUpMinutes)}.`}
        actions={<FilterBar filters={[rangeFilter]} />}
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard label="Inquiries received" value={summary.received} hint={`${summary.open} open right now`} />
        <StatCard
          label="Median first response"
          value={formatDuration(summary.medianFirstResponse)}
          hint={`Average ${formatDuration(summary.avgFirstResponse)}`}
          tone={summary.medianFirstResponse !== null && summary.medianFirstResponse > sla.firstResponseMinutes ? "danger" : "success"}
        />
        <StatCard
          label="SLA met"
          value={formatPercent(summary.slaCompliance)}
          hint={`${summary.slaBreaches} inquiries past target`}
          tone={summary.slaCompliance !== null && summary.slaCompliance < 0.8 ? "warning" : "success"}
        />
        <StatCard label="Orders completed" value={summary.ordersCompleted} tone="success" />
        <StatCard label="Completed revenue" value={formatMoney(summary.revenueCompleted)} />
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="font-heading text-lg">Rep responsiveness</CardTitle>
          <p className="text-sm text-muted-foreground">
            Click a rep to see their conversations. &quot;AI draft edits&quot; is how much a rep changed the AI draft
            before sending (0% = sent as-is).
          </p>
        </CardHeader>
        <CardContent>
          <RepTable reps={reps} slaMinutes={sla.firstResponseMinutes} range={range} />
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="font-heading text-lg">Median first response by day</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponseTrendChart trend={trend} slaMinutes={sla.firstResponseMinutes} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="font-heading text-lg">Inquiry volume by service</CardTitle>
          </CardHeader>
          <CardContent>
            <VolumeChart trend={trend} />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
