"use client";

import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { TrendingUp, LineChart as LineChartIcon } from "lucide-react";
import AiSectionCard from "@/features/ai/components/AiSectionCard";
import Skeleton from "@/shared/ui/Skeleton";
import { useChartTheme } from "@/features/ai/components/chart-theme";
import type { AiAccuracyPoint } from "@/shared/mock/ai";

type PredictionChartProps = {
  data: AiAccuracyPoint[];
  isLoading: boolean;
};

export default function PredictionChart({ data, isLoading }: PredictionChartProps) {
  const theme = useChartTheme();

  const latest = data.at(-1)?.accuracy ?? 0;
  const first = data[0]?.accuracy ?? 0;
  const delta = Number((latest - first).toFixed(1));

  return (
    <AiSectionCard
      title="Model Performance"
      subtitle="Accuracy trên tập validation, 7 ngày gần nhất."
      icon={LineChartIcon}
      action={
        !isLoading && (
          <div className="text-right">
            <p className="font-mono text-lg font-semibold leading-none text-gray-900 dark:text-slate-100">{latest.toFixed(1)}%</p>
            <p className={`mt-1 inline-flex items-center gap-0.5 text-[11px] font-semibold ${delta >= 0 ? "text-success" : "text-critical"}`}>
              <TrendingUp className={`h-3 w-3 ${delta >= 0 ? "" : "rotate-180"}`} />
              {delta >= 0 ? "+" : ""}{delta} pt / 7d
            </p>
          </div>
        )
      }
    >
      {isLoading ? (
        <Skeleton className="h-65 w-full rounded-lg" />
      ) : (
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={data} margin={{ top: 8, right: 12, left: -12, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={theme.grid} vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fill: theme.axisTick, fontSize: 11 }}
              tickLine={false}
              axisLine={{ stroke: theme.axisLine }}
            />
            <YAxis
              domain={["dataMin - 1", "dataMax + 1"]}
              tickCount={5}
              tick={{ fill: theme.axisTick, fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              width={48}
              tickFormatter={(value: number) => `${value.toFixed(1)}%`}
            />
            <Tooltip
              cursor={{ stroke: theme.axisLine, strokeWidth: 1 }}
              contentStyle={theme.tooltip}
              labelStyle={{ color: theme.axisTick, fontSize: 11 }}
              formatter={(value) => [`${Number(value).toFixed(1)}%`, "Accuracy"]}
            />
            <Line
              type="monotone"
              dataKey="accuracy"
              stroke={theme.accent}
              strokeWidth={2}
              dot={{ r: 3, fill: theme.accent, strokeWidth: 0 }}
              activeDot={{ r: 5, stroke: theme.tooltip.backgroundColor, strokeWidth: 2 }}
              name="Accuracy"
            />
          </LineChart>
        </ResponsiveContainer>
      )}
    </AiSectionCard>
  );
}
