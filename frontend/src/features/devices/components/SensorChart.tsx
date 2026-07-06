"use client";

import { useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import type { ApiSensorData } from "@/shared/types/api";

type TimeRange = "1h" | "6h" | "24h";

type ChartPoint = {
  time: string;
  temperature?: number;
  humidity?: number;
};

function formatTime(iso: string, range: TimeRange): string {
  const d = new Date(iso);
  if (range === "1h") {
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  }
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function filterByRange(data: ApiSensorData[], range: TimeRange): ApiSensorData[] {
  const hours = range === "1h" ? 1 : range === "6h" ? 6 : 24;
  const cutoff = Date.now() - hours * 60 * 60 * 1000;
  return data.filter((d) => new Date(d.received_at).getTime() >= cutoff);
}

type SensorChartProps = {
  data: ApiSensorData[];
  isLoading: boolean;
};

export default function SensorChart({ data, isLoading }: SensorChartProps) {
  const [range, setRange] = useState<TimeRange>("1h");

  const filtered = filterByRange(data, range);

  const chartData: ChartPoint[] = [...filtered]
    .sort((a, b) => new Date(a.received_at).getTime() - new Date(b.received_at).getTime())
    .map((d) => ({
      time: formatTime(d.received_at, range),
      temperature:
        typeof d.payload?.temperature === "number" ? d.payload.temperature : undefined,
      humidity:
        typeof d.payload?.humidity === "number" ? d.payload.humidity : undefined,
    }));

  return (
    <div className="rounded-2xl border border-[#E5EAF0] bg-white p-6 shadow-sm">
      <div className="mb-5 flex items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">Sensor Chart</p>
          <h3 className="mt-1 text-lg font-semibold text-gray-900">Temperature &amp; Humidity</h3>
        </div>
        <div className="flex gap-1.5">
          {(["1h", "6h", "24h"] as TimeRange[]).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRange(r)}
              className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition ${
                range === r
                  ? "bg-blue-600 text-white"
                  : "border border-gray-200 text-gray-500 hover:bg-gray-50"
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="flex h-52 items-center justify-center text-sm text-gray-400">
          Loading chart data…
        </div>
      ) : chartData.length === 0 ? (
        <div className="flex h-52 items-center justify-center text-sm text-gray-400">
          No data in the last {range}.
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={chartData} margin={{ top: 5, right: 10, left: -5, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E5EAF0" />
            <XAxis
              dataKey="time"
              tick={{ fill: "#9ca3af", fontSize: 10 }}
              tickLine={false}
              axisLine={{ stroke: "#E5EAF0" }}
              interval="preserveStartEnd"
            />
            <YAxis
              yAxisId="temperature"
              domain={["dataMin - 1", "dataMax + 1"]}
              tickCount={6}
              tick={{ fill: "#f97316", fontSize: 10 }}
              tickLine={false}
              axisLine={false}
              width={40}
            />
            <YAxis
              yAxisId="humidity"
              orientation="right"
              domain={["dataMin - 1", "dataMax + 1"]}
              tickCount={6}
              tick={{ fill: "#3b82f6", fontSize: 10 }}
              tickLine={false}
              axisLine={false}
              width={40}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "#ffffff",
                border: "1px solid #E5EAF0",
                borderRadius: "12px",
                fontSize: 12,
                boxShadow: "0 4px 16px rgba(0,0,0,0.08)",
              }}
              labelStyle={{ color: "#6b7280", fontSize: 11 }}
              itemStyle={{ fontSize: 12 }}
            />
            <Legend wrapperStyle={{ fontSize: 12, color: "#6b7280", paddingTop: 12 }} />
            <Line
              yAxisId="temperature"
              type="monotone"
              dataKey="temperature"
              stroke="#f97316"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
              name="Temperature (°C)"
              connectNulls
            />
            <Line
              yAxisId="humidity"
              type="monotone"
              dataKey="humidity"
              stroke="#3b82f6"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
              name="Humidity (%)"
              connectNulls
            />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
