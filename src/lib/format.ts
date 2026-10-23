import { formatDistanceToNowStrict, format } from "date-fns";

export function formatDuration(minutes: number | null | undefined) {
  if (minutes === null || minutes === undefined || Number.isNaN(minutes)) return "—";
  if (minutes < 1) return "<1m";
  if (minutes < 60) return `${Math.round(minutes)}m`;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h < 24) return m ? `${h}h ${m}m` : `${h}h`;
  const d = Math.floor(h / 24);
  const rh = h % 24;
  return rh ? `${d}d ${rh}h` : `${d}d`;
}

export const minutesBetween = (a: Date, b: Date) => (b.getTime() - a.getTime()) / 60_000;

export const timeAgo = (d: Date) => formatDistanceToNowStrict(d, { addSuffix: true });

export const formatDateTime = (d: Date) => format(d, "MMM d, yyyy h:mm a");

export const formatDate = (d: Date) => format(d, "MMM d, yyyy");

export const formatMoney = (n: number | null | undefined) =>
  n === null || n === undefined
    ? "—"
    : n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

export const formatPercent = (n: number | null | undefined) =>
  n === null || n === undefined || Number.isNaN(n) ? "—" : `${Math.round(n * 100)}%`;
