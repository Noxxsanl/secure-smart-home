import { Sparkles, X } from "lucide-react";
import type { Schedule } from "@shh/api-client/portal";
import {
  SCHEDULE_STATUS_CLASSES, SCHEDULE_STATUS_LABELS, countdownText, formatRunAt, scheduleReason,
} from "../model/scheduledAction";

type ScheduleRowProps = {
  schedule: Schedule;
  nowMs: number;
  /** Tab "Đã chạy": hiện trạng thái + lý do thay cho đếm ngược. */
  history?: boolean;
  /** Mục ở chi tiết thiết bị: bỏ tên phòng (đã rõ thiết bị nào). */
  compact?: boolean;
  disabled?: boolean;
  onCancel?: (schedule: Schedule) => void;
};

// Một dòng hẹn giờ — trang Hẹn giờ và mục "Hẹn giờ" ở chi tiết thiết bị dùng chung.
export default function ScheduleRow({ schedule, nowMs, history = false, compact = false, disabled = false, onCancel }: ScheduleRowProps) {
  const reason = history ? scheduleReason(schedule) : null;
  const when = formatRunAt(schedule.run_at, schedule.timezone, nowMs);
  const place = [!compact ? schedule.room_name : null, schedule.created_by_name ? `Tạo bởi ${schedule.created_by_name}` : null]
    .filter(Boolean)
    .join(" · ");

  return (
    <li className="flex flex-wrap items-center gap-3 px-4 py-3">
      <div className="min-w-44 flex-1">
        <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-gray-900 dark:text-slate-100">
          {schedule.action_label}
          {schedule.origin === "ai_agent" && (
            <span className="inline-flex items-center gap-1 rounded bg-brand-soft px-1.5 py-0.5 text-[10px] font-semibold text-brand">
              <Sparkles className="h-3 w-3" /> Trợ lý AI
            </span>
          )}
          {history && (
            <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${SCHEDULE_STATUS_CLASSES[schedule.status]}`}>
              {SCHEDULE_STATUS_LABELS[schedule.status]}
            </span>
          )}
        </p>
        <p className="mt-0.5 text-xs text-gray-500 dark:text-slate-400">
          {when}
          {!history && <span className="text-gray-400 dark:text-slate-500"> · {countdownText(schedule.run_at, nowMs)}</span>}
        </p>
        {place && <p className="mt-0.5 text-[11px] text-gray-400 dark:text-slate-500">{place}</p>}
        {reason && <p className="mt-0.5 text-xs text-gray-500 dark:text-slate-400">{reason}</p>}
      </div>
      {schedule.can_cancel && onCancel && (
        <button
          type="button" onClick={() => onCancel(schedule)} disabled={disabled}
          aria-label={`Huỷ hẹn giờ ${schedule.action_label} lúc ${when}`}
          className="inline-flex items-center gap-1 rounded border border-gray-200 dark:border-slate-600 px-3 py-1.5 text-xs font-semibold text-gray-600 dark:text-slate-300 transition hover:bg-critical-soft hover:text-critical disabled:opacity-50"
        >
          <X className="h-3.5 w-3.5" /> Huỷ
        </button>
      )}
    </li>
  );
}
