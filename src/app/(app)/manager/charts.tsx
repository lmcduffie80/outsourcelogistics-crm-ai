"use client";

import { Bar, BarChart, CartesianGrid, Line, LineChart, ReferenceLine, XAxis, YAxis } from "recharts";
import { format, parseISO } from "date-fns";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { formatDuration } from "@/lib/format";
import { serviceTypeColors, serviceTypeLabels } from "@/lib/labels";
import type { TeamMetrics } from "@/lib/metrics";

const responseConfig = {
  medianFirstResponse: { label: "Median first response", color: "var(--color-steel-500)" },
} satisfies ChartConfig;

const tick = (d: string) => format(parseISO(d), "MMM d");

const durationTick = (minutes: number) =>
  minutes === 0 ? "0" : minutes < 60 ? `${minutes}m` : `${Number((minutes / 60).toFixed(1))}h`;

/** Evenly spaced ticks on round durations, at most ~5 of them. */
function durationTicks(maxMinutes: number) {
  const step = [15, 30, 60, 120, 240, 480, 720, 1440].find((s) => maxMinutes / s <= 5) ?? 1440;
  const top = Math.max(step, Math.ceil(maxMinutes / step) * step);
  return Array.from({ length: top / step + 1 }, (_, i) => i * step);
}

export function ResponseTrendChart({ trend, slaMinutes }: { trend: TeamMetrics["trend"]; slaMinutes: number }) {
  const max = Math.max(slaMinutes, ...trend.map((t) => t.medianFirstResponse ?? 0));
  const ticks = durationTicks(max);
  return (
    <ChartContainer config={responseConfig} className="h-64 w-full">
      <LineChart data={trend} margin={{ left: 0, right: 12, top: 16 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="day" tickFormatter={tick} tickLine={false} axisLine={false} minTickGap={24} />
        <YAxis
          ticks={ticks}
          domain={[0, ticks.at(-1)!]}
          tickFormatter={durationTick}
          tickLine={false}
          axisLine={false}
          width={36}
        />
        <ReferenceLine
          y={slaMinutes}
          stroke="var(--color-svc-value)"
          strokeDasharray="4 4"
          label={{
            value: `Target ${formatDuration(slaMinutes)}`,
            position: "insideTopRight",
            fill: "var(--color-svc-value)",
            fontSize: 11,
          }}
        />
        <ChartTooltip
          content={
            <ChartTooltipContent
              labelFormatter={(_, p) => (p?.[0]?.payload?.day ? tick(p[0].payload.day) : "")}
              formatter={(v) => formatDuration(Number(v))}
            />
          }
        />
        <Line
          dataKey="medianFirstResponse"
          type="linear"
          stroke="var(--color-medianFirstResponse)"
          strokeWidth={2}
          dot={{ r: 2.5, fill: "var(--color-medianFirstResponse)", strokeWidth: 0 }}
          activeDot={{ r: 4 }}
          connectNulls
        />
      </LineChart>
    </ChartContainer>
  );
}

const volumeConfig = Object.fromEntries(
  Object.entries(serviceTypeLabels).map(([k, label]) => [k, { label, color: serviceTypeColors[k as keyof typeof serviceTypeColors] }]),
) satisfies ChartConfig;

/** Round count ticks (1, 2, 5, 10, 20, 25, 50…), at most ~5 of them. */
function countTicks(max: number) {
  const step = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500].find((s) => max / s <= 5) ?? 1000;
  const top = Math.max(step, Math.ceil(max / step) * step);
  return Array.from({ length: top / step + 1 }, (_, i) => i * step);
}

export function VolumeChart({ trend }: { trend: TeamMetrics["trend"] }) {
  const keys = Object.keys(serviceTypeLabels).filter((k) => trend.some((t) => (t as Record<string, unknown>)[k]));
  const dayTotal = (t: (typeof trend)[number]) =>
    keys.reduce((sum, k) => sum + (Number((t as Record<string, unknown>)[k]) || 0), 0);
  const ticks = countTicks(Math.max(1, ...trend.map(dayTotal)));
  return (
    <ChartContainer config={volumeConfig} className="h-72 w-full">
      <BarChart data={trend} margin={{ left: 4, right: 12, top: 8 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="day" tickFormatter={tick} tickLine={false} axisLine={false} minTickGap={24} />
        <YAxis ticks={ticks} domain={[0, ticks.at(-1)!]} tickLine={false} axisLine={false} width={28} />
        <ChartTooltip content={<ChartTooltipContent labelFormatter={(_, p) => (p?.[0]?.payload?.day ? tick(p[0].payload.day) : "")} />} />
        <ChartLegend content={<ChartLegendContent className="flex-wrap gap-x-4 gap-y-1 whitespace-nowrap" />} />
        {keys.map((k) => (
          <Bar key={k} dataKey={k} stackId="v" fill={`var(--color-${k})`} />
        ))}
      </BarChart>
    </ChartContainer>
  );
}
