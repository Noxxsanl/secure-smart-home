import { Database } from "lucide-react";
import AiSectionCard from "@/features/ai/components/AiSectionCard";
import Skeleton from "@/shared/ui/Skeleton";
import type { AiDatasetSummary } from "@/shared/mock/ai";

type DatasetSummaryProps = {
  dataset: AiDatasetSummary | null;
  isLoading: boolean;
};

function Split({ label, value, total }: { label: string; value: number; total: number }) {
  const share = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div className="rounded-lg border border-gray-100 dark:border-slate-700 px-3 py-2.5 transition-colors hover:bg-gray-50 dark:hover:bg-slate-700/40">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-slate-500">{label}</p>
      <p className="mt-1 text-lg font-semibold tabular-nums text-gray-900 dark:text-slate-100">{value.toLocaleString("en-US")}</p>
      <p className="mt-0.5 font-mono text-[11px] text-gray-400 dark:text-slate-500">{share}% dataset</p>
    </div>
  );
}

export default function DatasetSummary({ dataset, isLoading }: DatasetSummaryProps) {
  if (isLoading || !dataset) {
    return (
      <AiSectionCard title="Dataset Summary" subtitle="Phân chia dữ liệu huấn luyện và cân bằng nhãn." icon={Database}>
        <div className="grid gap-2 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-19 rounded-lg" />)}
        </div>
        <Skeleton className="mt-4 h-3 w-full rounded-full" />
      </AiSectionCard>
    );
  }

  const { on, off } = dataset.classDistribution;
  const labelled = on + off;
  const onShare = labelled > 0 ? (on / labelled) * 100 : 0;
  const offShare = 100 - onShare;

  return (
    <AiSectionCard
      title="Dataset Summary"
      subtitle="Phân chia dữ liệu huấn luyện và cân bằng nhãn."
      icon={Database}
      action={
        <span className="rounded bg-gray-100 dark:bg-slate-700 px-2 py-0.5 font-mono text-[11px] text-gray-500 dark:text-slate-400">
          {dataset.total.toLocaleString("en-US")} samples
        </span>
      }
    >
      <div className="grid gap-2 sm:grid-cols-3">
        <Split label="Training Samples" value={dataset.training} total={dataset.total} />
        <Split label="Validation Samples" value={dataset.validation} total={dataset.total} />
        <Split label="Test Samples" value={dataset.test} total={dataset.total} />
      </div>

      <div className="mt-4">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-slate-500">Class Distribution</p>
        {/* 2px surface gap between the two segments so they never fuse into one bar. */}
        <div className="mt-2 flex h-2.5 w-full gap-0.5 overflow-hidden rounded-full">
          <div className="h-full rounded-l-full bg-brand transition-all" style={{ width: `${onShare}%` }} />
          <div className="h-full rounded-r-full bg-gray-300 dark:bg-slate-600 transition-all" style={{ width: `${offShare}%` }} />
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs">
          <span className="inline-flex items-center gap-1.5 text-gray-600 dark:text-slate-300">
            <span className="h-2.5 w-2.5 rounded-sm bg-brand" />
            ON
            <span className="font-mono font-semibold tabular-nums text-gray-900 dark:text-slate-100">
              {on.toLocaleString("en-US")} ({onShare.toFixed(1)}%)
            </span>
          </span>
          <span className="inline-flex items-center gap-1.5 text-gray-600 dark:text-slate-300">
            <span className="h-2.5 w-2.5 rounded-sm bg-gray-300 dark:bg-slate-600" />
            OFF
            <span className="font-mono font-semibold tabular-nums text-gray-900 dark:text-slate-100">
              {off.toLocaleString("en-US")} ({offShare.toFixed(1)}%)
            </span>
          </span>
        </div>
      </div>
    </AiSectionCard>
  );
}
