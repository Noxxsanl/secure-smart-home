import { BrainCircuit, ShieldCheck, ShieldAlert, Timer } from "lucide-react";
import AiSectionCard from "@/features/ai/components/AiSectionCard";
import ProgressBar from "@/shared/ui/ProgressBar";
import StatusBadge from "@/shared/ui/StatusBadge";
import Skeleton from "@/shared/ui/Skeleton";
import type { AiModelHealth, AiModelStatus } from "@/shared/mock/ai";

const HEALTH_CONFIG: Record<AiModelHealth, { label: string; className: string; icon: typeof ShieldCheck }> = {
  healthy:  { label: "Healthy",  className: "bg-success-soft text-success ring-1 ring-success/30",   icon: ShieldCheck },
  degraded: { label: "Degraded", className: "bg-warning-soft text-warning ring-1 ring-warning/30",   icon: ShieldAlert },
  critical: { label: "Critical", className: "bg-critical-soft text-critical ring-1 ring-critical/30", icon: ShieldAlert },
};

const RUNTIME_STATUS: Record<AiModelStatus["status"], { label: string; badge: string }> = {
  running:  { label: "Running",  badge: "active" },
  training: { label: "Training", badge: "in_progress" },
  idle:     { label: "Idle",     badge: "inactive" },
};

type ModelStatusProps = {
  status: AiModelStatus | null;
  isLoading: boolean;
  /** Live progress while the mock training round runs; falls back to the stored value. */
  trainingProgress: number;
  isTraining: boolean;
};

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-gray-100 dark:border-slate-700 px-3 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-slate-500">{label}</p>
      <div className="mt-1 text-sm font-medium text-gray-900 dark:text-slate-100">{value}</div>
    </div>
  );
}

export default function ModelStatus({ status, isLoading, trainingProgress, isTraining }: ModelStatusProps) {
  if (isLoading || !status) {
    return (
      <AiSectionCard title="Model Status" subtitle="Runtime của model đang phục vụ dự đoán." icon={BrainCircuit}>
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-lg" />)}
        </div>
        <Skeleton className="mt-4 h-2 w-full rounded-full" />
      </AiSectionCard>
    );
  }

  const health = HEALTH_CONFIG[status.health];
  const HealthIcon = health.icon;
  const runtime = isTraining ? RUNTIME_STATUS.training : RUNTIME_STATUS[status.status];
  const percent = isTraining ? trainingProgress : status.trainingProgress;

  return (
    <AiSectionCard
      title="Model Status"
      subtitle="Runtime của model đang phục vụ dự đoán."
      icon={BrainCircuit}
      action={
        <span className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-semibold ${health.className}`}>
          <HealthIcon className="h-3 w-3" />
          {health.label}
        </span>
      }
    >
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        <Field label="Current Model" value={status.model} />
        <Field label="Version" value={<span className="font-mono">{status.version}</span>} />
        <Field label="Last Training" value={<span className="font-mono text-xs">{status.lastTraining}</span>} />
        <Field label="Prediction Mode" value={status.predictionMode} />
        <Field label="Status" value={<StatusBadge status={runtime.badge} label={runtime.label} />} />
        <Field
          label="Inference Latency"
          value={
            <span className="inline-flex items-center gap-1 font-mono">
              <Timer className="h-3 w-3 text-gray-400 dark:text-slate-500" />
              {status.inferenceLatencyMs}ms
            </span>
          }
        />
      </div>

      <div className="mt-4">
        <div className="mb-1.5 flex items-center justify-between text-xs">
          <span className="font-medium text-gray-700 dark:text-slate-300">Training Progress</span>
          <span className="font-mono text-gray-500 dark:text-slate-400">{percent}%</span>
        </div>
        <ProgressBar percent={percent} colorClassName={isTraining ? "bg-warning" : "bg-brand"} />
        <p className="mt-1.5 text-xs text-gray-400 dark:text-slate-500">
          {isTraining
            ? "Đang huấn luyện lại trên dataset mới nhất…"
            : "Checkpoint gần nhất đã được đồng bộ xuống toàn bộ gateway."}
        </p>
      </div>
    </AiSectionCard>
  );
}
