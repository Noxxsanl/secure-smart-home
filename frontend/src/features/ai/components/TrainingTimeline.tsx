import { History, Timer, Layers, Target } from "lucide-react";
import AiSectionCard from "@/features/ai/components/AiSectionCard";
import StatusBadge from "@/shared/ui/StatusBadge";
import Skeleton from "@/shared/ui/Skeleton";
import type { AiTrainingRun } from "@/shared/mock/ai";

type TrainingTimelineProps = {
  runs: AiTrainingRun[];
  isLoading: boolean;
};

function Metric({ icon: Icon, label, value }: { icon: typeof Timer; label: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded bg-gray-50 dark:bg-slate-700/60 px-2 py-0.5 text-[11px] text-gray-600 dark:text-slate-300">
      <Icon className="h-3 w-3 text-gray-400 dark:text-slate-500" />
      <span className="text-gray-400 dark:text-slate-500">{label}</span>
      <span className="font-mono font-semibold tabular-nums text-gray-800 dark:text-slate-100">{value}</span>
    </span>
  );
}

export default function TrainingTimeline({ runs, isLoading }: TrainingTimelineProps) {
  return (
    <AiSectionCard
      title="Recent Training History"
      subtitle="Các lần huấn luyện gần nhất và kết quả tương ứng."
      icon={History}
    >
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-lg" />)}
        </div>
      ) : (
        <ol className="space-y-0">
          {runs.map((run, index) => (
            <li key={run.id} className="relative flex gap-3 pb-5 last:pb-0">
              <div className="flex flex-col items-center">
                <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ring-4 ${
                  index === 0 ? "bg-brand ring-brand-soft" : "bg-gray-300 dark:bg-slate-600 ring-gray-100 dark:ring-slate-700/60"
                }`} />
                {index < runs.length - 1 && <span className="w-px flex-1 bg-gray-200 dark:bg-slate-700" />}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-mono text-sm font-semibold text-gray-900 dark:text-slate-100">{run.version}</p>
                  <StatusBadge status={run.status === "completed" ? "completed" : "rolled_back"} />
                  {index === 0 && (
                    <span className="rounded bg-brand-soft px-1.5 py-0.5 text-[10px] font-semibold text-brand">Current</span>
                  )}
                  <span className="ml-auto font-mono text-[11px] text-gray-400 dark:text-slate-500">{run.trainedAt}</span>
                </div>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  <Metric icon={Target} label="Accuracy" value={`${run.accuracy.toFixed(1)}%`} />
                  <Metric icon={Layers} label="Samples" value={run.samples.toLocaleString("en-US")} />
                  <Metric icon={Timer} label="Duration" value={`${run.durationSec} sec`} />
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}
    </AiSectionCard>
  );
}
