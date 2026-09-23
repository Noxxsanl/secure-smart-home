"use client";

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import { PieChart as PieChartIcon } from "lucide-react";
import AiSectionCard from "@/features/ai/components/AiSectionCard";
import DeviceCategoryIcon from "@/features/ai/components/DeviceCategoryIcon";
import Skeleton from "@/shared/ui/Skeleton";
import { useChartTheme } from "@/features/ai/components/chart-theme";
import type { AiDistributionSlice } from "@/shared/mock/ai";

type PredictionPieProps = {
  data: AiDistributionSlice[];
  isLoading: boolean;
};

export default function PredictionPie({ data, isLoading }: PredictionPieProps) {
  const theme = useChartTheme();

  return (
    <AiSectionCard
      title="Device Prediction Distribution"
      subtitle="Tỉ trọng dự đoán theo nhóm thiết bị."
      icon={PieChartIcon}
    >
      {isLoading ? (
        <Skeleton className="h-65 w-full rounded-lg" />
      ) : (
        <div className="flex flex-col items-center gap-4 sm:flex-row">
          <div className="h-55 w-full sm:w-1/2">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data}
                  dataKey="value"
                  nameKey="label"
                  cx="50%"
                  cy="50%"
                  innerRadius={52}
                  outerRadius={86}
                  paddingAngle={2}
                  stroke={theme.tooltip.backgroundColor}
                  strokeWidth={2}
                >
                  {data.map((slice, index) => (
                    <Cell key={slice.key} fill={theme.series[index % theme.series.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={theme.tooltip}
                  labelStyle={{ color: theme.axisTick, fontSize: 11 }}
                  formatter={(value, name) => [`${Number(value)}%`, name]}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* Legend doubles as the direct-label layer — identity never rests on color alone. */}
          <ul className="w-full space-y-1.5 sm:w-1/2">
            {data.map((slice, index) => (
              <li
                key={slice.key}
                className="flex items-center gap-2 rounded-lg border border-gray-100 dark:border-slate-700 px-3 py-2 transition-colors hover:bg-gray-50 dark:hover:bg-slate-700/50"
              >
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-sm"
                  style={{ backgroundColor: theme.series[index % theme.series.length] }}
                />
                <DeviceCategoryIcon category={slice.key} />
                <span className="flex-1 truncate text-sm text-gray-700 dark:text-slate-300">{slice.label}</span>
                <span className="font-mono text-sm font-semibold tabular-nums text-gray-900 dark:text-slate-100">{slice.value}%</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </AiSectionCard>
  );
}
