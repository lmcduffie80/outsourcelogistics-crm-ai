import { AlertTriangle, Flame } from "lucide-react";
import type { InquiryStatus, OrderStatus, Priority, ServiceType } from "@/db/schema";
import {
  inquiryStatusLabels,
  orderStatusLabels,
  priorityLabels,
  serviceTypeColors,
  serviceTypeLabels,
} from "@/lib/labels";
import { cn } from "@/lib/utils";

const pill = "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap";

export function ServiceBadge({ type }: { type: ServiceType }) {
  return (
    <span className={cn(pill, "text-white")} style={{ backgroundColor: serviceTypeColors[type] }}>
      {serviceTypeLabels[type]}
    </span>
  );
}

const statusStyles: Record<InquiryStatus, string> = {
  new: "bg-steel-100 text-steel-800",
  draft_ready: "bg-steel-500 text-white",
  needs_reply: "bg-svc-transportation/15 text-[#9a5f17]",
  responded: "bg-svc-port/15 text-[#3f6a35]",
  converted: "bg-svc-port text-white",
  closed: "bg-muted text-muted-foreground",
};

export function StatusBadge({ status }: { status: InquiryStatus }) {
  return <span className={cn(pill, statusStyles[status])}>{inquiryStatusLabels[status]}</span>;
}

const orderStyles: Record<OrderStatus, string> = {
  booked: "bg-steel-100 text-steel-800",
  in_progress: "bg-svc-transportation/15 text-[#9a5f17]",
  completed: "bg-svc-port text-white",
  cancelled: "bg-muted text-muted-foreground line-through",
};

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return <span className={cn(pill, orderStyles[status])}>{orderStatusLabels[status]}</span>;
}

export function PriorityBadge({ priority }: { priority: Priority }) {
  if (priority === "normal" || priority === "low") {
    return <span className="text-xs text-muted-foreground">{priorityLabels[priority]}</span>;
  }
  return (
    <span
      className={cn(
        pill,
        priority === "urgent" ? "bg-svc-value text-white" : "bg-svc-value/15 text-svc-value",
      )}
    >
      {priority === "urgent" ? <Flame className="size-3" /> : <AlertTriangle className="size-3" />}
      {priorityLabels[priority]}
    </span>
  );
}
