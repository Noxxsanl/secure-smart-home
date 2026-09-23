"use client";

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, LabelList, ResponsiveContainer,
} from "recharts";
import { BarChart3 } from "lucide-react";
import AiSectionCard from "@/features/ai/components/AiSectionCard";
import Skeleton from "@/shared/ui/Skeleton";
import { useChartTheme } from "@/features/ai/components/chart-theme";
import type { AiFeatureImportance } from "@/shared/mock/ai";

type FeatureImportanceProps = {
  data: AiFeatureImportance[];
  isLoading: boolean;
};

export default function FeatureImportance({ data, isLoading }: FeatureImportanceProps) {
  const theme = useChartTheme();
  const sorted = [...data].sort((a, b) => b.importance - a.importance);

  return (
    <AiSectionCard
      title="Feature Importance"
      subtitle="Mức đóng góp của từng đặc trưng vào quyết định của model."
      icon={BarChart3}
    >
      {isLoading ? (
        <Skeleton className="h-85 w-full rounded-lg" />
      ) : (
        <ResponsiveContainer width="100%" height={340}>
          <BarChart data={sorted} layout="vertical" margin={{ top: 4, right: 44, left: 8, bottom: 4 }} barCategoryGap={6}>
            <CartesianGrid strokeDasharray="3 3" stroke={theme.grid} horizontal={false} />
            <XAxis
              type="number"
              domain={[0, "dataMax + 3"]}
              tick={{ fill: theme.axisTick, fontSize: 11 }}
              tickLine={false}
              axisLine={{ stroke: theme.axisLine }}
              tickFormatter={(value: number) => `${value}%`}
            />
            <YAxis
              type="category"
              dataKey="feature"
              tick={{ fill: theme.axisTick, fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              width={104}
            />
            <Tooltip
              cursor={{ fill: theme.isDark ? "rgba(148,163,184,0.08)" : "rgba(17,24,39,0.04)" }}
              contentStyle={theme.tooltip}
              labelStyle={{ color: theme.axisTick, fontSize: 11 }}
              formatter={(value) => [`${Number(value)}%`, "Importance"]}
            />
            {/* Magnitude-only chart: one hue, values direct-labelled at the bar end. */}
            <Bar dataKey="importance" fill={theme.accent} radius={[0, 4, 4, 0]} barSize={14}>
              <LabelList
                dataKey="importance"
                position="right"
                offset={8}
                formatter={(value) => `${value}%`}
                style={{ fill: theme.axisTick, fontSize: 11, fontVariantNumeric: "tabular-nums" }}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </AiSectionCard>
  );
}
