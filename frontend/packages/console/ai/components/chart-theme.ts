"use client";

import { useTheme } from "next-themes";

// ---------------------------------------------------------------------------
// Recharts renders to SVG, so it can't read Tailwind/CSS variables the way the
// rest of the UI does — the palette has to be handed to it as literal colors.
// Both ramps below were validated for the light (#FFFFFF) and dark (#111827)
// chart surfaces: lightness band, chroma floor, adjacent-pair separation under
// deuteranopia/tritanopia, and contrast against the surface.
// ---------------------------------------------------------------------------

const SERIES_LIGHT = ["#F4600E", "#3B6FD4", "#0E9384", "#7A5AF8"] as const;
const SERIES_DARK  = ["#E56413", "#5C8DF0", "#12A594", "#8A70F0"] as const;

export type ChartTheme = {
  isDark: boolean;
  /** Categorical hues, assigned in fixed order — never cycled. */
  series: readonly string[];
  /** Single-hue color for magnitude-only charts (accuracy, importance). */
  accent: string;
  grid: string;
  axisTick: string;
  axisLine: string;
  tooltip: {
    backgroundColor: string;
    border: string;
    borderRadius: string;
    fontSize: number;
    boxShadow: string;
    color: string;
  };
};

export function useChartTheme(): ChartTheme {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  return {
    isDark,
    series: isDark ? SERIES_DARK : SERIES_LIGHT,
    accent: isDark ? SERIES_DARK[0] : SERIES_LIGHT[0],
    grid: isDark ? "#1E293B" : "#EEF1F5",
    axisTick: isDark ? "#94A3B8" : "#9CA3AF",
    axisLine: isDark ? "#334155" : "#E5EAF0",
    tooltip: {
      backgroundColor: isDark ? "#0F172A" : "#FFFFFF",
      border: `1px solid ${isDark ? "#334155" : "#E5EAF0"}`,
      borderRadius: "10px",
      fontSize: 12,
      boxShadow: isDark ? "0 4px 16px rgba(0,0,0,0.45)" : "0 4px 16px rgba(0,0,0,0.08)",
      color: isDark ? "#E2E8F0" : "#111827",
    },
  };
}
