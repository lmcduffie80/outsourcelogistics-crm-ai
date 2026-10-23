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

export function ResponseTrendChart({ trend, slaMinutes }: { trend: TeamMetrics["trend"]; slaMinutes: number }) {
  return (
    <ChartContainer config={responseConfig} className="h-64 w-full">
      <LineChart data={trend} margin={{ left: 4, right: 12, top: 8 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="day" tickFormatter={tick} tickLine={false} axisLine={false} minTickGap={24} />
        <YAxis
          tickFormatter={(v: number) => formatDuration(v)}
          tickLine={false}
          axisLine={false}
          width={56}
        />
        <ReferenceLine
          y={slaMinutes}
          stroke="var(--color-svc-value)"
          strokeDasharray="4 4"
          label={{ value: "SLA", position: "insideTopRight", fill: "var(--color-svc-value)", fontSize: 11 }}
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
          type="monotone"
          stroke="var(--color-medianFirstResponse)"
          strokeWidth={2}
          dot={false}
          connectNulls
        />
      </LineChart>
    </ChartContainer>
  );
}

const volumeConfig = Object.fromEntries(
  Object.entries(serviceTypeLabels).map(([k, label]) => [k, { label, color: serviceTypeColors[k as keyof typeof serviceTypeColors] }]),
) satisfies ChartConfig;

export function VolumeChart({ trend }: { trend: TeamMetrics["trend"] }) {
  const keys = Object.keys(serviceTypeLabels).filter((k) => trend.some((t) => (t as Record<string, unknown>)[k]));
  return (
    <ChartContainer config={volumeConfig} className="h-64 w-full">
      <BarChart data={trend} margin={{ left: 4, right: 12, top: 8 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="day" tickFormatter={tick} tickLine={false} axisLine={false} minTickGap={24} />
        <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={28} />
        <ChartTooltip content={<ChartTooltipContent labelFormatter={(_, p) => (p?.[0]?.payload?.day ? tick(p[0].payload.day) : "")} />} />
        <ChartLegend content={<ChartLegendContent />} />
        {keys.map((k) => (
          <Bar key={k} dataKey={k} stackId="v" fill={`var(--color-${k})`} />
        ))}
      </BarChart>
    </ChartContainer>
  );
}
