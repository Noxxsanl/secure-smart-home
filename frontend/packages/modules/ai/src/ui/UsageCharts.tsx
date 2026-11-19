"use client";

import {
  Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { useTheme } from "next-themes";
import type { AiUsageBucket } from "@shh/api-client/dashboard";
import { bucketLabel, formatMs, formatTokens, formatUsd } from "../model/format";

// Ba biểu đồ một trục (không dual-axis): chi phí, token vào/ra, độ trễ p95 theo giờ/ngày.
// Màu vào/ra = cặp xanh/cam đã kiểm bằng dataviz validate_palette (CVD ΔE ≥ 27, đạt cả nền sáng #FFFFFF và
// nền tối #1E293B). Chữ dùng màu chữ, không dùng màu chuỗi.

function useColors() {
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme === "dark";
  return {
    primary: dark ? "#5C8DF0" : "#3B6FD4",
    secondary: dark ? "#E56413" : "#F4600E",
    surface: dark ? "#1E293B" : "#FFFFFF",
    grid: dark ? "#1E293B" : "#EEF1F5",
    axis: dark ? "#94A3B8" : "#9CA3AF",
    tooltipBg: dark ? "#0F172A" : "#FFFFFF",
    tooltipBorder: dark ? "#334155" : "#E5EAF0",
    tooltipText: dark ? "#E2E8F0" : "#111827",
  };
}

type ChartProps = { series: AiUsageBucket[] };

function ChartFrame({ title, legend, children }: { title: string; legend?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-[#E5EAF0] dark:border-slate-700 bg-white dark:bg-slate-800 p-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-gray-900 dark:text-slate-100">{title}</p>
        {legend}
      </div>
      <div className="h-48">{children}</div>
    </div>
  );
}

function useAxisProps() {
  const c = useColors();
  return {
    tick: { fill: c.axis, fontSize: 11 },
    axisLine: false,
    tickLine: false,
  } as const;
}

function useTooltipStyle() {
  const c = useColors();
  return {
    contentStyle: {
      background: c.tooltipBg, border: `1px solid ${c.tooltipBorder}`, borderRadius: 6, fontSize: 12, color: c.tooltipText,
    },
    labelStyle: { color: c.tooltipText, fontWeight: 600 },
    itemStyle: { color: c.tooltipText },
    cursor: { fill: c.grid },
  };
}

export function CostChart({ series }: ChartProps) {
  const c = useColors();
  const axis = useAxisProps();
  const tooltip = useTooltipStyle();
  return (
    <ChartFrame title="Chi phí (USD)">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={series} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke={c.grid} />
          <XAxis dataKey="bucket" tickFormatter={(b: string) => bucketLabel(b)} minTickGap={16} {...axis} />
          <YAxis width={56} tickFormatter={(v: number) => formatUsd(v)} {...axis} />
          <Tooltip
            {...tooltip}
            labelFormatter={(b) => bucketLabel(String(b), true)}
            formatter={(v) => [formatUsd(Number(v)), "Chi phí"]}
          />
          <Bar dataKey="cost_usd" name="Chi phí" fill={c.primary} radius={[4, 4, 0, 0]} maxBarSize={18} />
        </BarChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

export function TokenChart({ series }: ChartProps) {
  const c = useColors();
  const axis = useAxisProps();
  const tooltip = useTooltipStyle();
  const legend = (
    <span className="flex items-center gap-3 text-xs text-gray-500 dark:text-slate-400">
      <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: c.primary }} />Vào</span>
      <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: c.secondary }} />Ra</span>
    </span>
  );
  return (
    <ChartFrame title="Token" legend={legend}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={series} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke={c.grid} />
          <XAxis dataKey="bucket" tickFormatter={(b: string) => bucketLabel(b)} minTickGap={16} {...axis} />
          <YAxis width={56} tickFormatter={(v: number) => formatTokens(v)} {...axis} />
          <Tooltip
            {...tooltip}
            labelFormatter={(b) => bucketLabel(String(b), true)}
            formatter={(v, name) => [formatTokens(Number(v)), String(name)]}
          />
          {/* Viền 2px màu nền tạo khe giữa hai đoạn xếp chồng */}
          <Bar dataKey="input_tokens" name="Token vào" stackId="t" fill={c.primary} stroke={c.surface} strokeWidth={2} maxBarSize={18} />
          <Bar dataKey="output_tokens" name="Token ra" stackId="t" fill={c.secondary} stroke={c.surface} strokeWidth={2} radius={[4, 4, 0, 0]} maxBarSize={18} />
        </BarChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

export function LatencyChart({ series }: ChartProps) {
  const c = useColors();
  const axis = useAxisProps();
  const tooltip = useTooltipStyle();
  return (
    <ChartFrame title="Độ trễ p95">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={series} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke={c.grid} />
          <XAxis dataKey="bucket" tickFormatter={(b: string) => bucketLabel(b)} minTickGap={16} {...axis} />
          <YAxis width={56} tickFormatter={(v: number) => formatMs(v)} {...axis} />
          <Tooltip
            {...tooltip}
            cursor={{ stroke: c.axis, strokeWidth: 1 }}
            labelFormatter={(b) => bucketLabel(String(b), true)}
            formatter={(v) => [formatMs(v === null ? null : Number(v)), "p95"]}
          />
          <Line
            type="monotone" dataKey="p95_latency_ms" name="p95" stroke={c.primary} strokeWidth={2} connectNulls
            dot={false} activeDot={{ r: 4, stroke: c.surface, strokeWidth: 2 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}
