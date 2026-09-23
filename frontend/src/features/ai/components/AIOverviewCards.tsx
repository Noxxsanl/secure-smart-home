import type { LucideIcon } from "lucide-react";
import { BrainCircuit, Target, Crosshair, Activity, Gauge, Database, TrendingUp } from "lucide-react";
import Skeleton from "@/shared/ui/Skeleton";
import type { AiOverviewIconKey, AiOverviewMetric } from "@/shared/mock/ai";

const METRIC_ICONS: Record<AiOverviewIconKey, LucideIcon> = {
  model: BrainCircuit,
  accuracy: Target,
  precision: Crosshair,
  recall: Activity,
  f1: Gauge,
  dataset: Database,
};

type AIOverviewCardsProps = {
  metrics: AiOverviewMetric[];
  isLoading: boolean;
};

export default function AIOverviewCards({ metrics, isLoading }: AIOverviewCardsProps) {
  if (isLoading) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-[#E5EAF0] dark:border-slate-700 bg-white dark:bg-slate-800 p-4 shadow-sm">
            <Skeleton className="h-8 w-8 rounded-lg" />
            <Skeleton className="mt-3 h-6 w-24" />
            <Skeleton className="mt-2 h-3 w-16" />
            <Skeleton className="mt-2 h-3 w-28" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
      {metrics.map((metric) => {
        const Icon = METRIC_ICONS[metric.key];
        return (
          <article
            key={metric.key}
            className="group rounded-xl border border-[#E5EAF0] dark:border-slate-700 bg-white dark:bg-slate-800 p-4 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-brand/40 hover:shadow-md"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-brand-soft text-brand transition-transform duration-200 group-hover:scale-110">
                <Icon className="h-4 w-4" />
              </span>
              {metric.delta !== null && (
                <span className="inline-flex items-center gap-0.5 rounded bg-success-soft px-1.5 py-0.5 text-[10px] font-semibold text-success">
                  <TrendingUp className="h-2.5 w-2.5" />
                  +{metric.key === "dataset" ? metric.delta.toLocaleString("en-US") : metric.delta}
                </span>
              )}
            </div>
            <p className="mt-3 truncate text-xl font-semibold text-gray-900 dark:text-slate-100">{metric.value}</p>
            <p className="mt-0.5 text-sm font-medium text-gray-700 dark:text-slate-300">{metric.label}</p>
            <p className="mt-0.5 truncate text-xs text-gray-400 dark:text-slate-500">{metric.hint}</p>
          </article>
        );
      })}
    </div>
  );
}
