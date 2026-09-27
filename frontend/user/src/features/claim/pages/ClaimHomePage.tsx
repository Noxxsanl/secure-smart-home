"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Smartphone } from "lucide-react";
import { useToast } from "@smarthome/shared/ui/Toast";
import { claimHome, normalizeActivationCode } from "@smarthome/shared/mock/portal";
import { useCurrentHome } from "@/features/home/providers/CurrentHomeProvider";
import { claimErrorMessage } from "@/lib/errors";

export default function ClaimHomePage() {
  const router = useRouter();
  const { customerId, refreshHomes, selectHome } = useCurrentHome();
  const { showToast } = useToast();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const complete = code.replace(/-/g, "").length === 12;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (!complete) {
      setError("Activation Code gồm 12 ký tự (dạng XXXX-XXXX-XXXX). Vui lòng nhập đủ.");
      return;
    }
    setSubmitting(true);
    try {
      const home = await claimHome(customerId, code);
      await refreshHomes();
      selectHome(home.id);
      showToast(`Đã kích hoạt ${home.name}. Bạn là chủ nhà.`);
      router.push("/home");
    } catch (err) {
      setError(claimErrorMessage(err));
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
          // FR-3.2: tự chèn gạch, không phân biệt hoa/thường.
          onChange={(e) => setCode(normalizeActivationCode(e.target.value))}
          placeholder="XXXX-XXXX-XXXX"
          autoComplete="off"
          spellCheck={false}
          className="h-12 w-full rounded border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 px-4 text-center font-mono text-lg tracking-[0.3em] text-gray-900 dark:text-slate-100 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/15"
        />

        {error && (
          <p role="alert" className="mt-3 rounded border border-critical/30 bg-critical-soft px-3 py-2 text-sm text-critical">{error}</p>
        )}

        <button
          type="submit" disabled={submitting || !complete}
          className="mt-4 h-10 w-full rounded bg-brand text-sm font-semibold text-white transition hover:brightness-90 disabled:opacity-50"
        >
          {submitting ? "Đang kích hoạt…" : "Kích hoạt"}
        </button>
      </form>

      <div className="flex gap-3 rounded-md border border-[#E5EAF0] dark:border-slate-700 bg-white dark:bg-slate-800 p-4 text-sm text-gray-600 dark:text-slate-300">
        <Smartphone className="mt-0.5 h-4 w-4 shrink-0 text-info" />
        <p>
          Quét QR và cài đặt WiFi cho Gateway được thực hiện trên ứng dụng di động. Sau khi kích hoạt ở đây, mở app để
          đưa Gateway lên mạng — các thiết bị trong kit sẽ tự ghép.
        </p>
      </div>

      <div className="rounded-md bg-gray-50 dark:bg-slate-800/60 px-4 py-3 text-xs text-gray-500 dark:text-slate-400">
        <p className="font-semibold text-gray-600 dark:text-slate-300">Mã demo (dữ liệu mock)</p>
        <p className="mt-1 font-mono">7K2M-9QXA-4TPB · H3VD-8NRW-2CYE — hợp lệ</p>
        <p className="font-mono">Q4ZT-6MJK-1PSX — đã dùng · B9FE-3WRA-7GMK — hết hạn</p>
      </div>
    </div>
  );
}
