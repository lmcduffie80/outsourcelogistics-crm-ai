import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Bot, Building2, Mail, Phone, User } from "lucide-react";
import { OrderStatusBadge, PriorityBadge, ServiceBadge, StatusBadge } from "@/components/badges";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentUser, isManager } from "@/lib/auth/session";
import { formatDateTime, formatDuration, formatMoney, minutesBetween, timeAgo } from "@/lib/format";
import { getInquiryDetail, listActiveStaff } from "@/lib/inquiries/queries";
import { inquiryNumber, orderNumber } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { ReplyComposer } from "./reply-composer";
import { AssignmentControl, CloseButton, ConvertToOrderDialog, DetailsForm } from "./side-panels";

export async function generateMetadata({ params }: PageProps<"/inquiries/[id]">): Promise<Metadata> {
  const inquiry = await getInquiryDetail((await params).id).catch(() => undefined);
  return { title: inquiry ? `${inquiryNumber(inquiry.number)} ${inquiry.subject}` : "Inquiry" };
}

const activityLabels: Record<string, string> = {
  "inquiry.created": "Inquiry created from email",
  "ack.sent": "Acknowledgment sent automatically",
  "draft.generated": "AI draft generated",
  "reply.sent": "Reply sent",
  "customer.replied": "Customer replied",
  "details.updated": "Details edited",
  "inquiry.reassigned": "Reassigned",
  "inquiry.closed": "Closed",
  "inquiry.reopened": "Reopened",
  "order.created": "Converted to order",
};

export default async function InquiryPage({ params }: PageProps<"/inquiries/[id]">) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [user, inquiry, staff] = await Promise.all([getCurrentUser(), getInquiryDetail(id), listActiveStaff()]);
  if (!inquiry) notFound();

  const manager = isManager(user);
  const canEdit = manager || !inquiry.assignedRepId || inquiry.assignedRepId === user.id;
  const pendingDraft = inquiry.drafts.find((d) => d.status === "pending") ?? null;
  const closed = inquiry.status === "closed";
  const converted = inquiry.status === "converted";
  const firstResponse = inquiry.firstResponseAt ? minutesBetween(inquiry.receivedAt, inquiry.firstResponseAt) : null;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/inquiries" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" /> All inquiries
        </Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="font-heading text-sm tracking-widest text-steel-500">{inquiryNumber(inquiry.number)}</p>
            <h1 className="text-2xl text-steel-900">{inquiry.subject}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <StatusBadge status={inquiry.status} />
              <ServiceBadge type={inquiry.serviceType} />
              <PriorityBadge priority={inquiry.priority} />
              <span className="text-xs text-muted-foreground">
                Received {formatDateTime(inquiry.receivedAt)} · First response{" "}
                {firstResponse === null ? "pending" : `in ${formatDuration(firstResponse)}`}
              </span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {!converted && (
              <ConvertToOrderDialog
                inquiryId={inquiry.id}
                serviceType={inquiry.serviceType}
                summary={inquiry.summary}
                origin={inquiry.extracted?.origin ?? null}
                destination={inquiry.extracted?.destination ?? null}
                canEdit={canEdit}
              />
            )}
            {!converted && <CloseButton inquiryId={inquiry.id} closed={closed} canEdit={canEdit} />}
          </div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-4">
          <section aria-label="Conversation" className="space-y-3">
            {inquiry.messages.map((m) => {
              const inbound = m.direction === "inbound";
              const system = m.sentBy === "system";
              return (
                <article
                  key={m.id}
                  className={cn(
                    "rounded-lg border bg-card p-4",
                    inbound ? "mr-8 border-l-4 border-l-steel-400" : "ml-8",
                    system && "border-dashed bg-steel-50/60",
                  )}
                >
                  <header className="mb-2 flex flex-wrap items-center justify-between gap-2 text-sm">
                    <div className="flex items-center gap-2">
                      {system ? <Bot className="size-4 text-steel-500" /> : <Mail className="size-4 text-steel-500" />}
                      <span className="font-semibold">
                        {system ? "Automatic acknowledgment" : (m.sender?.name ?? m.fromName ?? m.fromAddress)}
                      </span>
                      {!system && <span className="text-xs text-muted-foreground">&lt;{m.fromAddress}&gt;</span>}
                      {m.aiDraftId && (
                        <span className="rounded bg-steel-100 px-1.5 py-0.5 text-[10px] font-semibold text-steel-700 uppercase">
                          From AI draft
                        </span>
                      )}
                    </div>
                    <time className="text-xs text-muted-foreground" title={formatDateTime(m.sentAt)}>
                      {timeAgo(m.sentAt)}
                    </time>
                  </header>
                  <p className="mb-2 text-xs text-muted-foreground">{m.subject}</p>
                  <div className="text-sm leading-relaxed whitespace-pre-wrap">{m.bodyText}</div>
                </article>
              );
            })}
          </section>

          {!closed && (
            <ReplyComposer
              inquiryId={inquiry.id}
              draft={pendingDraft}
              customerEmail={inquiry.customer.email}
              canEdit={canEdit}
            />
          )}
        </div>

        <aside className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="font-heading text-base">Customer</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p className="flex items-center gap-2 font-semibold">
                <User className="size-4 text-steel-500" /> {inquiry.customer.name}
              </p>
              {inquiry.customer.company && (
                <p className="flex items-center gap-2">
                  <Building2 className="size-4 text-steel-500" /> {inquiry.customer.company}
                </p>
              )}
              <a href={`mailto:${inquiry.customer.email}`} className="flex items-center gap-2 hover:underline">
                <Mail className="size-4 text-steel-500" /> {inquiry.customer.email}
              </a>
              {inquiry.customer.phone && (
                <a href={`tel:${inquiry.customer.phone}`} className="flex items-center gap-2 hover:underline">
                  <Phone className="size-4 text-steel-500" /> {inquiry.customer.phone}
                </a>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="font-heading text-base">Assigned rep</CardTitle>
            </CardHeader>
            <CardContent>
              <AssignmentControl
                inquiryId={inquiry.id}
                repId={inquiry.assignedRepId}
                reps={staff.filter((s) => s.role === "rep" || s.id === inquiry.assignedRepId)}
                canReassign={canEdit}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="font-heading text-base">Shipment details</CardTitle>
              <p className="text-xs text-muted-foreground">Extracted from the email by AI. Correct anything it missed.</p>
            </CardHeader>
            <CardContent>
              <DetailsForm
                inquiryId={inquiry.id}
                serviceType={inquiry.serviceType}
                priority={inquiry.priority}
                summary={inquiry.summary}
                extracted={inquiry.extracted ?? null}
                canEdit={canEdit}
              />
            </CardContent>
          </Card>

          {inquiry.orders.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="font-heading text-base">Orders</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {inquiry.orders.map((o) => (
                  <Link
                    key={o.id}
                    href={`/orders?q=${o.number}`}
                    className="flex items-center justify-between rounded-md border p-2 hover:bg-muted"
                  >
                    <span className="font-semibold">{orderNumber(o.number)}</span>
                    <span className="text-muted-foreground">{formatMoney(o.value)}</span>
                    <OrderStatusBadge status={o.status} />
                  </Link>
                ))}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="font-heading text-base">Activity</CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="space-y-2 border-l pl-4 text-sm">
                {inquiry.activity.map((a) => (
                  <li key={a.id} className="relative">
                    <span className="absolute top-1.5 -left-[21px] size-2.5 rounded-full bg-steel-400" />
                    <p>
                      {activityLabels[a.type] ?? a.type}
                      {a.type === "inquiry.reassigned" && a.details?.to ? ` to ${String(a.details.to)}` : ""}
                      {a.user?.name && <span className="text-muted-foreground"> · {a.user.name}</span>}
                    </p>
                    <p className="text-xs text-muted-foreground">{formatDateTime(a.createdAt)}</p>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}
