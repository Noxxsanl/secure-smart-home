import { useState } from "react";
import { CheckCircle2, Loader2, ShieldQuestion, XCircle, type LucideIcon } from "lucide-react";
import type { AgentPending } from "@shh/api-client/portal";
import type { PendingOutcome } from "../model/assistant";
import { countdownClock, formatRunAt, isExpired } from "../model/scheduleView";
import StepResults from "./StepResults";

type PendingCardProps = {
  pending: AgentPending;
  outcome: PendingOutcome;
  /** Múi giờ IANA của nhà. */
  timezone: string;
  nowMs: number;
  onConfirm: (stepIndexes: number[]) => void;
  onReject: () => void;
};

const EXPIRED_TEXT = "Yêu cầu đã hết hạn, bạn nói lại giúp mình nhé.";
const SHELL = "ml-8 rounded-md border border-brand/30 bg-brand-soft/40 dark:bg-slate-800";

// Tiêu đề theo trạng thái của thẻ: chưa quyết định → "Cần xác nhận"; sau đó đổi theo kết cục.
function headFor(phase: PendingOutcome["phase"]): { title: string; Icon: LucideIcon; iconClass: string } {
  switch (phase) {
    case "done":
      return { title: "Đã thực hiện", Icon: CheckCircle2, iconClass: "text-success" };
    case "rejected":
      return { title: "Đã huỷ", Icon: XCircle, iconClass: "text-gray-500 dark:text-slate-400" };
    case "stale":
      return { title: "Không còn hiệu lực", Icon: XCircle, iconClass: "text-warning" };
    default:
      return { title: "Cần xác nhận", Icon: ShieldQuestion, iconClass: "text-brand" };
  }
}

function Head({ phase }: { phase: PendingOutcome["phase"] }) {
  const { title, Icon, iconClass } = headFor(phase);
  return (
    <h3 className="flex items-center gap-1.5 px-3 pt-2.5 text-xs font-semibold text-gray-800 dark:text-slate-100">
      <Icon className={`h-3.5 w-3.5 ${iconClass}`} /> {title}
    </h3>
  );
}

// "Cần xác nhận": thẻ chỉ còn cho lệnh CHƯA rõ (AI tự suy ra, mơ hồ thiết bị, thiếu động từ…) — lệnh nói/gõ rõ ràng
// backend đã làm ngay (xem ExecutedList). Chọn bước nào, đếm ngược hạn 5 phút; sau khi xác nhận hiện kết quả từng bước.
// Không gọi API — việc đó do feature.
export default function PendingCard({ pending, outcome, timezone, nowMs, onConfirm, onReject }: PendingCardProps) {
  const [selected, setSelected] = useState<number[]>(() => pending.steps.map((s) => s.index));

  const toggle = (index: number) =>
    setSelected((prev) => (prev.includes(index) ? prev.filter((i) => i !== index) : [...prev, index]));

  if (outcome.phase === "done") {
    return (
      <section className={SHELL} aria-label="Kết quả">
        <Head phase="done" />
        <StepResults results={outcome.results} timezone={timezone} nowMs={nowMs} emptyText="Đã xác nhận." />
      </section>
    );
  }

  if (outcome.phase === "rejected") {
    return (
      <section className={SHELL}>
        <Head phase="rejected" />
        <p className="px-3 pb-2.5 pt-1 text-xs text-gray-500 dark:text-slate-400">Đã huỷ yêu cầu. Mình không thực hiện gì cả.</p>
      </section>
    );
  }

  if (outcome.phase === "stale") {
    return (
      <section className={SHELL}>
        <Head phase="stale" />
        <p className="px-3 pb-2.5 pt-1 text-xs text-gray-600 dark:text-slate-300">{outcome.message}</p>
      </section>
    );
  }

  const expired = isExpired(pending.expires_at, nowMs);
  const clock = countdownClock(pending.expires_at, nowMs);
  const working = outcome.phase === "confirming" || outcome.phase === "rejecting";
  const locked = expired || working;

  return (
    <section className={SHELL} aria-label="Cần xác nhận">
      <Head phase={outcome.phase} />
      <ul className="space-y-1 px-3 py-2">
        {pending.steps.map((step) => (
          <li key={step.index}>
            <label className={`flex items-start gap-2 text-sm ${locked ? "opacity-60" : "cursor-pointer"}`}>
              <input
                type="checkbox"
                className="mt-1 h-4 w-4 accent-brand"
                checked={selected.includes(step.index)}
                disabled={locked}
                onChange={() => toggle(step.index)}
              />
              <span className="min-w-0">
                <span className="block font-medium text-gray-900 dark:text-slate-100">
                  {step.action_label}
                  {step.room_name ? <span className="font-normal text-gray-500 dark:text-slate-400"> · {step.room_name}</span> : null}
                </span>
                <span className="block text-xs text-gray-500 dark:text-slate-400">
                  {step.run_at ? `Hẹn ${formatRunAt(step.run_at, timezone, nowMs)}` : "Thực hiện ngay khi xác nhận"}
                </span>
              </span>
            </label>
          </li>
        ))}
      </ul>
      {expired ? (
        <p className="px-3 pb-2.5 text-xs font-medium text-warning">{EXPIRED_TEXT}</p>
      ) : (
        <p className="px-3 pb-1 text-xs text-gray-500 dark:text-slate-400">
          Hết hạn sau <span className="font-semibold tabular-nums">{clock}</span>
        </p>
      )}
      {outcome.phase === "open" && outcome.error && (
        <p className="px-3 pb-1 text-xs text-critical" role="alert">{outcome.error}</p>
      )}
      <div className="flex items-center justify-end gap-2 px-3 pb-2.5 pt-1">
        <button
          type="button"
          onClick={onReject}
          disabled={locked}
          className="inline-flex items-center gap-1.5 rounded border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
        >
          {outcome.phase === "rejecting" && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Huỷ
        </button>
        <button
          type="button"
          onClick={() => onConfirm(selected)}
          disabled={locked || selected.length === 0}
          className="inline-flex items-center gap-1.5 rounded bg-brand px-3 py-1.5 text-xs font-semibold text-white transition hover:brightness-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {outcome.phase === "confirming" && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Xác nhận
        </button>
      </div>
    </section>
  );
}
