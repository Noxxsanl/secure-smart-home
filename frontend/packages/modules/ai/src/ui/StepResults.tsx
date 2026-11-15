import { AlertTriangle, CheckCircle2, MinusCircle } from "lucide-react";
import type { Schedule } from "@shh/api-client/portal";
import { resultLabel, resultReason, resultTone } from "../model/scheduleView";

type StepResultsProps = {
  results: Schedule[];
  /** Múi giờ IANA của nhà (dùng khi bước không kèm múi giờ). */
  timezone: string;
  nowMs: number;
  /** Câu hiện khi không có bước nào. */
  emptyText?: string;
};

const TONE_CLASS = { ok: "text-success", bad: "text-critical", neutral: "text-gray-500 dark:text-slate-400" } as const;

// Kết quả từng bước Trợ lý đã làm (sau khi xác nhận, hoặc lệnh rõ làm ngay): icon + nhãn + phòng + lý do nếu lỗi.
export default function StepResults({ results, timezone, nowMs, emptyText }: StepResultsProps) {
  return (
    <ul className="space-y-1.5 px-3 py-2.5">
      {results.length === 0 && emptyText && <li className="text-xs text-gray-500 dark:text-slate-400">{emptyText}</li>}
      {results.map((s) => {
        const tone = resultTone(s.status);
        const reason = resultReason(s);
        const Icon = tone === "ok" ? CheckCircle2 : tone === "bad" ? AlertTriangle : MinusCircle;
        return (
          <li key={s.id} className="flex items-start gap-2 text-sm">
            <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${TONE_CLASS[tone]}`} />
            <div className="min-w-0">
              <p className="font-medium text-gray-900 dark:text-slate-100">
                {s.action_label}
                {s.room_name ? <span className="font-normal text-gray-500 dark:text-slate-400"> · {s.room_name}</span> : null}
              </p>
              <p className={`text-xs ${TONE_CLASS[tone]}`}>{resultLabel(s, s.timezone || timezone, nowMs)}</p>
              {reason && <p className="text-xs text-gray-500 dark:text-slate-400">{reason}</p>}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
