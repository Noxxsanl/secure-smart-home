import type { LucideIcon } from "lucide-react";
import { Sparkles, CheckCircle2, Hand, Gauge } from "lucide-react";
import Skeleton from "@/shared/ui/Skeleton";
import type { AiPredictionStat, AiPredictionStatKey } from "@/shared/mock/ai";

const STAT_STYLES: Record<AiPredictionStatKey, { icon: LucideIcon; iconClass: string }> = {
  today:      { icon: Sparkles,     iconClass: "bg-brand-soft text-brand" },
  automated:  { icon: CheckCircle2, iconClass: "bg-success-soft text-success" },
  override:   { icon: Hand,         iconClass: "bg-warning-soft text-warning" },
  confidence: { icon: Gauge,        iconClass: "bg-brand-soft text-brand" },
};

type PredictionStatsProps = {
  stats: AiPredictionStat[];
  isLoading: boolean;
};

export default function PredictionStats({ stats, isLoading }: PredictionStatsProps) {
  if (isLoading) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-[#E5EAF0] dark:border-slate-700 bg-white dark:bg-slate-800 p-4 shadow-sm">
            <Skeleton className="h-3 w-32" />
            <Skeleton className="mt-3 h-7 w-16" />
            <Skeleton className="mt-2 h-3 w-40" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {stats.map((stat) => {
        const style = STAT_STYLES[stat.key];
        const Icon = style.icon;
        return (
          <article
            key={stat.key}
            className="group flex items-start gap-3 rounded-xl border border-[#E5EAF0] dark:border-slate-700 bg-white dark:bg-slate-800 p-4 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-md"
          >
            <span className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-transform duration-200 group-hover:scale-110 ${style.iconClass}`}>
              <Icon className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-medium text-gray-500 dark:text-slate-400">{stat.label}</p>
              <p className="mt-0.5 text-2xl font-semibold tabular-nums text-gray-900 dark:text-slate-100">
                {stat.value.toLocaleString("en-US")}
                {stat.suffix && <span className="text-base font-medium text-gray-400 dark:text-slate-500">{stat.suffix}</span>}
              </p>
              <p className="mt-0.5 truncate text-xs text-gray-400 dark:text-slate-500">{stat.hint}</p>
            </div>
          </article>
        );
      })}
    </div>
  );
}
