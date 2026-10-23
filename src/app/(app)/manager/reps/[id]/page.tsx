import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { FilterBar } from "@/components/filter-bar";
import { PageHeader, StatCard } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireRole } from "@/lib/auth/session";
import { formatDuration, formatMoney, formatPercent } from "@/lib/format";
import { listInquiries } from "@/lib/inquiries/queries";
import { parseRange, rangeStart, teamMetrics } from "@/lib/metrics";
import { InquiryTable } from "../../../inquiries/inquiry-table";
import { ResponseTrendChart } from "../../charts";
import { rangeFilter } from "../../range-filter";

export const metadata: Metadata = { title: "Rep detail" };

export default async function RepDetailPage({ params, searchParams }: PageProps<"/manager/reps/[id]">) {
  const user = await requireRole("manager", "admin");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const range = parseRange((await searchParams).range);
  const { reps, trend, sla } = await teamMetrics(range, id);
  const rep = reps[0];
  if (!rep) notFound();

  const start = rangeStart(range);
  const conversations = (await listInquiries(user, { rep: id, view: "all" })).filter((r) => r.receivedAt >= start);

  return (
    <>
      <Link
        href={`/manager?range=${range}`}
        className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Team dashboard
      </Link>
      <PageHeader title={rep.name} description="Customer service rep" actions={<FilterBar filters={[rangeFilter]} />} />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-6">
        <StatCard label="Open now" value={rep.open} />
        <StatCard
          label="Median 1st response"
          value={formatDuration(rep.firstResponseMedian)}
          tone={rep.firstResponseMedian !== null && rep.firstResponseMedian > sla.firstResponseMinutes ? "danger" : "success"}
        />
        <StatCard label="Avg reply time" value={formatDuration(rep.replyAvg)} hint="Includes follow-ups" />
        <StatCard
          label="SLA met"
          value={formatPercent(rep.slaCompliance)}
          hint={`${rep.slaBreaches} breaches`}
          tone={rep.slaBreaches ? "warning" : "success"}
        />
        <StatCard
          label="AI draft edits"
          value={formatPercent(rep.aiEditRatio)}
          hint={`${rep.aiDraftsUsed} of ${rep.repliesSent} replies from AI drafts`}
        />
        <StatCard
          label="Orders completed"
          value={rep.ordersCompleted}
          hint={formatMoney(rep.revenueCompleted)}
          tone="success"
        />
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="font-heading text-lg">Median first response by day</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponseTrendChart trend={trend} slaMinutes={sla.firstResponseMinutes} />
        </CardContent>
      </Card>

      <h2 className="mb-3 text-lg text-steel-900 uppercase">Conversations ({conversations.length})</h2>
      <InquiryTable rows={conversations} />
    </>
  );
}
