import Link from "next/link";
import { CalendarClock, Loader2, X } from "lucide-react";
import type { Schedule } from "@shh/api-client/portal";
import { formatRunAt } from "../model/scheduleView";

type ScheduledListProps = {
  schedules: Schedule[];
  /** Múi giờ IANA của nhà. */
  timezone: string;
  nowMs: number;
  /** Id lịch đang gửi yêu cầu huỷ. */
  cancellingId: number | null;
  onCancel: (schedule: Schedule) => void;
  /** Bấm "Xem lịch hẹn" — panel tự đóng. */
  onNavigate: () => void;
};

// "Đã hẹn": lịch Trợ lý vừa tạo tự động (người dùng đã nói rõ giờ). Huỷ được tới lúc chạy.
export default function ScheduledList({ schedules, timezone, nowMs, cancellingId, onCancel, onNavigate }: ScheduledListProps) {
  if (schedules.length === 0) return null;
  return (
    <section className="ml-8 rounded-md border border-[#E5EAF0] bg-white dark:border-slate-700 dark:bg-slate-800" aria-label="Đã hẹn">
      <h3 className="flex items-center gap-1.5 border-b border-gray-100 px-3 py-2 text-xs font-semibold text-gray-700 dark:border-slate-700 dark:text-slate-200">
        <CalendarClock className="h-3.5 w-3.5 text-brand" /> Đã hẹn
      </h3>
      <ul className="divide-y divide-gray-100 dark:divide-slate-700">
        {schedules.map((s) => {
          const when = formatRunAt(s.run_at, s.timezone || timezone, nowMs);
          const cancellable = s.status === "scheduled" && s.can_cancel;
          return (
            <li key={s.id} className="flex items-center gap-2 px-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-gray-900 dark:text-slate-100">{s.action_label}</p>
                <p className="text-xs text-gray-500 dark:text-slate-400">
                  {when}
                  {s.room_name ? ` · ${s.room_name}` : ""}
                </p>
              </div>
              {s.status === "cancelled" ? (
                <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold text-gray-600 dark:bg-slate-700 dark:text-slate-300">Đã huỷ</span>
              ) : s.status === "done" ? (
                <span className="rounded bg-success-soft px-1.5 py-0.5 text-[10px] font-semibold text-success">Đã chạy</span>
              ) : cancellable ? (
                <button
                  type="button"
                  onClick={() => onCancel(s)}
                  disabled={cancellingId !== null}
                  aria-label={`Huỷ hẹn giờ ${s.action_label} lúc ${when}`}
                  className="inline-flex items-center gap-1 rounded border border-gray-200 px-2.5 py-1 text-xs font-semibold text-gray-600 transition hover:bg-critical-soft hover:text-critical disabled:opacity-50 dark:border-slate-600 dark:text-slate-300"
                >
                  {cancellingId === s.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />} Huỷ
                </button>
              ) : null}
            </li>
          );
        })}
      </ul>
      <div className="border-t border-gray-100 px-3 py-2 text-xs dark:border-slate-700">
        <Link href="/schedules" onClick={onNavigate} className="font-semibold text-brand hover:underline">
          Xem lịch hẹn
        </Link>
      </div>
    </section>
  );
}
