import type { Metadata } from "next";
import { FilterBar, type FilterDef } from "@/components/filter-bar";
import { PageHeader, StatCard } from "@/components/page-header";
import { getCurrentUser, isManager } from "@/lib/auth/session";
import { inquiryCounts, listActiveStaff, listInquiries, parseInquiryFilters } from "@/lib/inquiries/queries";
import { inquiryStatusLabels, serviceTypeLabels } from "@/lib/labels";
import { InquiryTable } from "./inquiry-table";

export const metadata: Metadata = { title: "Inquiries" };

export default async function InquiriesPage({ searchParams }: PageProps<"/inquiries">) {
  const user = await getCurrentUser();
  const filters = parseInquiryFilters(await searchParams);
  const [rows, counts, staff] = await Promise.all([
    listInquiries(user, filters),
    inquiryCounts(user),
    listActiveStaff(),
  ]);
  const breached = rows.filter((r) => r.slaBreached).length;
  const manager = isManager(user);

  const filterDefs: FilterDef[] = [
    {
      name: "view",
      label: "Status",
      defaultValue: "open",
      options: [
        { value: "open", label: "Open" },
        { value: "all", label: "All statuses" },
        ...Object.entries(inquiryStatusLabels).map(([value, label]) => ({ value, label })),
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
    {
      name: "rep",
      label: "Rep",
      defaultValue: manager ? "all" : "mine",
      options: [
        { value: "mine", label: "My inquiries" },
        { value: "all", label: "Everyone" },
        { value: "unassigned", label: "Unassigned" },
        ...staff.filter((s) => s.role === "rep" && s.id !== user.id).map((s) => ({ value: s.id, label: s.name })),
      ],
    },
  ];

  return (
    <>
      <PageHeader
        title="Inquiries"
        description="Customer emails from the quotes inbox. Each one is acknowledged automatically; review the AI draft and send the full reply."
      />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Draft ready" value={counts.draftReady} hint="AI reply waiting for review" />
        <StatCard label="Needs reply" value={counts.needsReply} hint="Customer wrote back" tone="warning" />
        <StatCard label="Urgent open" value={counts.urgent} tone={counts.urgent ? "danger" : "default"} />
        <StatCard
          label="Past SLA (this view)"
          value={breached}
          tone={breached ? "danger" : "success"}
          hint="Waiting longer than the response target"
        />
      </div>
      <div className="mb-4">
        <FilterBar filters={filterDefs} searchPlaceholder="Search subject, customer, INQ #" />
      </div>
      <InquiryTable rows={rows} />
    </>
  );
}
