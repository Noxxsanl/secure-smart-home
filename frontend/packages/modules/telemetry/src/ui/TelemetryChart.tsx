"use client";

import {
  CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { useTheme } from "next-themes";

// ---------------------------------------------------------------------------
// Biểu đồ lịch sử cảm biến theo khung 24 giờ / 7 ngày (FR-5.4). Nhận đúng
// shape `points` của API telemetry (CONTRACT §4.2: `{ t, temperature, humidity }`,
// trung bình theo bucket, cũ → mới) — dùng được cho cả cổng khách và console.
// SensorChart cũ (dữ liệu thô 1h/6h/24h) giữ nguyên cho trang đang dùng nó.
// ---------------------------------------------------------------------------

export type TelemetryRange = "24h" | "7d";

export type TelemetryChartPoint = {
  t: string;
  temperature: number | null;
  humidity: number | null;
};

const RANGE_LABELS: Record<TelemetryRange, string> = { "24h": "24 giờ", "7d": "7 ngày" };

type TelemetryChartProps = {
  points: TelemetryChartPoint[];
  range: TelemetryRange;
  onRangeChange: (range: TelemetryRange) => void;
  isLoading: boolean;
  /** Thông điệp lỗi đã dịch sẵn (không truyền mã lỗi thô). */
  errorMessage?: string | null;
  title?: string;
};

function formatTick(iso: string, range: TelemetryRange): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return range === "24h"
    ? d.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" });
}

function formatFull(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("vi-VN", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function useChartColors() {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  return {
    temperature: isDark ? "#E56413" : "#F4600E",
    humidity: isDark ? "#5C8DF0" : "#3B6FD4",
    grid: isDark ? "#1E293B" : "#EEF1F5",
    axis: isDark ? "#94A3B8" : "#9CA3AF",
    axisLine: isDark ? "#334155" : "#E5EAF0",
    tooltipBg: isDark ? "#0F172A" : "#FFFFFF",
    tooltipBorder: isDark ? "#334155" : "#E5EAF0",
    tooltipText: isDark ? "#E2E8F0" : "#111827",
  };
}

export default function TelemetryChart({
  points, range, onRangeChange, isLoading, errorMessage, title = "Nhiệt độ & độ ẩm",
}: TelemetryChartProps) {
  const colors = useChartColors();
  const hasTemperature = points.some((p) => p.temperature !== null);
  const hasHumidity = points.some((p) => p.humidity !== null);
  const isEmpty = !hasTemperature && !hasHumidity;

  return (
    <div className="rounded-md border border-[#E5EAF0] bg-white p-5 dark:border-slate-700 dark:bg-slate-800">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 dark:text-slate-500">Lịch sử cảm biến</p>
          <h3 className="mt-0.5 text-base font-semibold text-gray-900 dark:text-slate-100">{title}</h3>
        </div>
        <div className="flex gap-1.5" role="group" aria-label="Khoảng thời gian">
          {(Object.keys(RANGE_LABELS) as TelemetryRange[]).map((r) => (
            <button
              key={r}
              type="button"
              aria-pressed={range === r}
              onClick={() => onRangeChange(r)}
              className={`rounded px-3 py-1.5 text-xs font-semibold transition ${
                range === r
                  ? "bg-brand text-white"
                  : "border border-gray-200 text-gray-500 hover:bg-gray-50 dark:border-slate-600 dark:text-slate-400 dark:hover:bg-slate-700"
              }`}
            >
              {RANGE_LABELS[r]}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="flex h-60 items-center justify-center text-sm text-gray-400 dark:text-slate-500">
          Đang tải dữ liệu biểu đồ…
        </div>
      ) : errorMessage ? (
        <div className="flex h-60 items-center justify-center px-6 text-center text-sm text-critical">{errorMessage}</div>
      ) : isEmpty ? (
        <div className="flex h-60 items-center justify-center px-6 text-center text-sm text-gray-400 dark:text-slate-500">
          Chưa có dữ liệu trong {RANGE_LABELS[range]} qua. Kiểm tra cảm biến đã online và gửi dữ liệu chưa.
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={points} margin={{ top: 5, right: 10, left: -5, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={colors.grid} />
            <XAxis
              dataKey="t"
              tickFormatter={(value) => formatTick(String(value), range)}
              tick={{ fill: colors.axis, fontSize: 10 }}
              tickLine={false}
              axisLine={{ stroke: colors.axisLine }}
              interval="preserveStartEnd"
              minTickGap={24}
            />
            {hasTemperature && (
              <YAxis
                yAxisId="temperature"
                domain={["dataMin - 1", "dataMax + 1"]}
                tickCount={6}
                tick={{ fill: colors.temperature, fontSize: 10 }}
                tickLine={false}
                axisLine={false}
                width={40}
                allowDecimals={false}
              />
            )}
            {hasHumidity && (
              <YAxis
                yAxisId="humidity"
                orientation="right"
                domain={["dataMin - 2", "dataMax + 2"]}
                tickCount={6}
                tick={{ fill: colors.humidity, fontSize: 10 }}
                tickLine={false}
                axisLine={false}
                width={40}
                allowDecimals={false}
              />
            )}
            <Tooltip
              labelFormatter={(label) => formatFull(String(label))}
              contentStyle={{
                backgroundColor: colors.tooltipBg,
                border: `1px solid ${colors.tooltipBorder}`,
                borderRadius: "10px",
                fontSize: 12,
                color: colors.tooltipText,
              }}
              labelStyle={{ color: colors.axis, fontSize: 11 }}
            />
            <Legend wrapperStyle={{ fontSize: 12, color: colors.axis, paddingTop: 12 }} />
            {hasTemperature && (
              <Line
                yAxisId="temperature" type="monotone" dataKey="temperature" name="Nhiệt độ (°C)"
                stroke={colors.temperature} strokeWidth={2} dot={false} activeDot={{ r: 4 }} connectNulls
              />
            )}
            {hasHumidity && (
              <Line
                yAxisId="humidity" type="monotone" dataKey="humidity" name="Độ ẩm (%)"
                stroke={colors.humidity} strokeWidth={2} dot={false} activeDot={{ r: 4 }} connectNulls
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
