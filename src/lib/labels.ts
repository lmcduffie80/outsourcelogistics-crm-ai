import type { InquiryStatus, OrderStatus, Priority, ServiceType } from "@/db/schema";

export const serviceTypeLabels: Record<ServiceType, string> = {
  warehousing: "Warehousing",
  transportation: "Transportation",
  port_services: "Port Services",
  transloading: "Transloading",
  value_added: "Value Added",
  other: "Other",
};

/** Sampled from the service imagery on outsourcelogistics.com. */
export const serviceTypeColors: Record<ServiceType, string> = {
  warehousing: "#4f6f93",
  transportation: "#d48a31",
  port_services: "#5d9250",
  transloading: "#6786a1",
  value_added: "#c94f40",
  other: "#8a97a3",
};

export const inquiryStatusLabels: Record<InquiryStatus, string> = {
  new: "New",
  draft_ready: "Draft ready",
  needs_reply: "Needs reply",
  responded: "Responded",
  converted: "Converted",
  closed: "Closed",
};

export const openInquiryStatuses: InquiryStatus[] = ["new", "draft_ready", "needs_reply"];

export const priorityLabels: Record<Priority, string> = {
  low: "Low",
  normal: "Normal",
  high: "High",
  urgent: "Urgent",
};

export const orderStatusLabels: Record<OrderStatus, string> = {
  booked: "Booked",
  in_progress: "In progress",
  completed: "Completed",
  cancelled: "Cancelled",
};

export function inquiryNumber(n: number) {
  return `INQ-${n}`;
}

export function orderNumber(n: number) {
  return `ORD-${n}`;
}
