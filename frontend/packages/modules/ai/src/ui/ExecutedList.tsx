import { AlertTriangle, CheckCircle2 } from "lucide-react";
import type { Schedule } from "@shh/api-client/portal";
import StepResults from "./StepResults";

/** Bước được coi là "đã xong" theo nghĩa người dùng: chạy rồi, đang chạy, hoặc không cần chạy (đã đúng trạng thái). */
const SETTLED_OK = new Set<Schedule["status"]>(["done", "running", "skipped"]);

type ExecutedListProps = {
  executed: Schedule[];
  /** Múi giờ IANA của nhà. */
  timezone: string;
  nowMs: number;
};

// "Đã thực hiện": các bước lệnh rõ mà backend đã chạy ngay (không cần xác nhận), kèm kết quả từng bước. Mọi bước đều
// không chạy được (thiết bị ngoại tuyến, mất quyền…) thì tiêu đề đổi thành "Chưa thực hiện được" để khỏi gây hiểu nhầm.
export default function ExecutedList({ executed, timezone, nowMs }: ExecutedListProps) {
  if (executed.length === 0) return null;
  const anyOk = executed.some((s) => SETTLED_OK.has(s.status));
  const title = anyOk ? "Đã thực hiện" : "Chưa thực hiện được";
  const Icon = anyOk ? CheckCircle2 : AlertTriangle;
  return (
    <section className="ml-8 rounded-md border border-[#E5EAF0] bg-white dark:border-slate-700 dark:bg-slate-800" aria-label={title}>
      <h3 className="flex items-center gap-1.5 border-b border-gray-100 px-3 py-2 text-xs font-semibold text-gray-700 dark:border-slate-700 dark:text-slate-200">
        <Icon className={`h-3.5 w-3.5 ${anyOk ? "text-success" : "text-critical"}`} /> {title}
      </h3>
      <StepResults results={executed} timezone={timezone} nowMs={nowMs} />
    </section>
  );
}
