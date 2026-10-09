"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { KeyRound, LifeBuoy, Smartphone } from "lucide-react";
import { useToast } from "@smarthome/shared/ui/Toast";
import { apiErrorCode } from "@smarthome/shared/api/http";
import { FetchError } from "@smarthome/shared/api/errors";
import { claimHome } from "@/lib/api/claim";
import { isCompleteActivationCode, isValidActivationCode, normalizeActivationCode } from "@/lib/activation";
import { claimErrorMessage, retryAfterSeconds } from "@/lib/errors";
import { useCurrentHome } from "@/features/home/providers/CurrentHomeProvider";

// Mã chứa ký tự ngoài bảng Crockford (VD chữ U) chắc chắn không tồn tại — báo
// luôn như "mã không đúng" mà không tốn một lượt thử (FR-3.6 đếm lần nhập sai).
const INVALID_CODE_ERROR = new FetchError(404, { error: "NOT_FOUND" });

export default function ClaimHomePage() {
  const router = useRouter();
  const { refresh, selectHome } = useCurrentHome();
  const { showToast } = useToast();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  // Sau 429 RATE_LIMITED khoá nút đến hết thời gian backend yêu cầu chờ.
  const [locked, setLocked] = useState(false);

  const complete = isCompleteActivationCode(code);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (!complete) {
      setError("Activation Code gồm 12 ký tự (dạng XXXX-XXXX-XXXX). Vui lòng nhập đủ.");
      return;
    }
    if (!isValidActivationCode(code)) {
      setError(claimErrorMessage(INVALID_CODE_ERROR));
      return;
    }

    setSubmitting(true);
    try {
      const { home } = await claimHome(code);
      // Lấy lại danh sách nhà trước rồi mới chọn nhà mới, để nhà đó chắc chắn có trong danh sách.
      await refresh();
      selectHome(home.id);
      showToast(`Đã kích hoạt ${home.name}. Bạn là chủ nhà.`);
      router.push("/home");
    } catch (err) {
      setError(claimErrorMessage(err));
      if (apiErrorCode(err) === "RATE_LIMITED") {
        setLocked(true);
        setTimeout(() => setLocked(false), (retryAfterSeconds(err) ?? 15 * 60) * 1000);
      }
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-xl space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-gray-900 dark:text-slate-100">Thêm Smart Home</h1>
        <p className="mt-0.5 text-sm text-gray-500 dark:text-slate-400">
          Kích hoạt kit vừa mua bằng Activation Code in trên tem dán ở hộp Gateway.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="rounded-md border border-[#E5EAF0] dark:border-slate-700 bg-white dark:bg-slate-800 p-5">
        <label htmlFor="activation-code" className="mb-2 flex items-center gap-2 text-sm font-semibold text-gray-700 dark:text-slate-200">
          <KeyRound className="h-4 w-4 text-brand" /> Activation Code
        </label>
        <input
          id="activation-code"
          value={code}
          // FR-3.2: tự chèn gạch, không phân biệt hoa/thường; O→0, I/L→1 như backend.
          onChange={(e) => setCode(normalizeActivationCode(e.target.value))}
          placeholder="XXXX-XXXX-XXXX"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          className="h-12 w-full rounded border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 px-4 text-center font-mono text-lg tracking-[0.3em] text-gray-900 dark:text-slate-100 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/15"
        />

        {error && (
          <p role="alert" className="mt-3 rounded border border-critical/30 bg-critical-soft px-3 py-2 text-sm text-critical">{error}</p>
        )}

        <button
          type="submit" disabled={submitting || locked || !complete}
          className="mt-4 h-10 w-full rounded bg-brand text-sm font-semibold text-white transition hover:brightness-90 disabled:opacity-50"
        >
          {submitting ? "Đang kích hoạt…" : locked ? "Tạm khoá — vui lòng đợi" : "Kích hoạt"}
        </button>
      </form>

      <div className="flex gap-3 rounded-md border border-[#E5EAF0] dark:border-slate-700 bg-white dark:bg-slate-800 p-4 text-sm text-gray-600 dark:text-slate-300">
        <Smartphone className="mt-0.5 h-4 w-4 shrink-0 text-info" />
        <p>
          Quét QR và cài đặt WiFi cho Gateway được thực hiện trên ứng dụng di động. Sau khi kích hoạt ở đây, mở app để
          đưa Gateway lên mạng — các thiết bị trong kit sẽ tự ghép.
        </p>
      </div>

      <div className="flex gap-3 rounded-md border border-[#E5EAF0] dark:border-slate-700 bg-white dark:bg-slate-800 p-4 text-sm text-gray-600 dark:text-slate-300">
        <LifeBuoy className="mt-0.5 h-4 w-4 shrink-0 text-info" />
        <p>
          Mất tem hoặc không kích hoạt được? Liên hệ bộ phận hỗ trợ kèm <strong>mã người dùng</strong> của bạn (xem ở trang{" "}
          <Link href="/profile" className="font-semibold text-brand hover:brightness-90">Hồ sơ</Link>) để nhân viên gán nhà
          trực tiếp cho tài khoản.
        </p>
      </div>
    </div>
  );
}
