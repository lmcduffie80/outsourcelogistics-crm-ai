import type { FilterDef } from "@/components/filter-bar";

export const rangeFilter: FilterDef = {
  name: "range",
  label: "Date range",
  defaultValue: "30d",
  options: [
    { value: "7d", label: "Last 7 days" },
    { value: "30d", label: "Last 30 days" },
    { value: "90d", label: "Last 90 days" },
  ],
};
