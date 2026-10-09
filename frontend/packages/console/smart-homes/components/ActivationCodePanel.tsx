"use client";

import { useState } from "react";
import { AlertTriangle, Check, Copy, Printer } from "lucide-react";
import QrCode from "@smarthome/console/components/QrCode";
import ActivationPrintLabel from "@smarthome/console/smart-homes/components/ActivationPrintLabel";
import { formatDateTime, formatRemaining } from "@smarthome/console/lib/format";
import { BTN_PRIMARY, BTN_SECONDARY } from "@smarthome/console/lib/ui";
import type { ActivationCodeIssued, PackageCode } from "@smarthome/console/api/types";

type ActivationCodePanelProps = {
  activation: ActivationCodeIssued;
  homeName: string;
  packageCode: PackageCode;
};

// FR-2.4/2.5: QR có chữ ký (giá trị = qr_payload, không chứa secret) + mã
// XXXX-XXXX-XXXX + hạn dùng + in tem. Plaintext chỉ có trong response tạo mã,
// nên phải nhắc rõ: rời trang là mất, chỉ còn cách tạo mã mới.
export default function ActivationCodePanel({ activation, homeName, packageCode }: ActivationCodePanelProps) {
  const [copied, setCopied] = useState(false);
  const remaining = formatRemaining(activation.expires_at);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(activation.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2.5 rounded border border-warning/30 bg-warning-soft px-3 py-2.5 text-sm text-warning">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <p>
          <span className="font-semibold">Mã chỉ hiển thị MỘT LẦN.</span> Hãy in tem ngay bây giờ. Nếu rời trang trước khi in,
          bạn phải tạo mã mới ở trang chi tiết nhà (mã cũ sẽ bị thu hồi).
        </p>
      </div>

      <div className="flex flex-col items-center gap-5 rounded border border-gray-100 dark:border-slate-700 p-5 sm:flex-row sm:items-center">
        <div className="rounded bg-white p-2 ring-1 ring-gray-200 dark:ring-slate-600">
          <QrCode value={activation.qr_payload} size={168} />
        </div>
        <div className="min-w-0 flex-1 space-y-2 text-center sm:text-left">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400 dark:text-slate-500">Mã kích hoạt</p>
          <div className="flex items-center justify-center gap-2 sm:justify-start">
            <p className="font-mono text-2xl font-bold tracking-widest text-gray-900 dark:text-slate-100">{activation.code}</p>
            <button
              type="button"
              onClick={handleCopy}
              aria-label="Sao chép mã"
              className="flex h-7 w-7 items-center justify-center rounded text-gray-400 dark:text-slate-500 hover:bg-gray-100 dark:hover:bg-slate-700"
            >
              {copied ? <Check size={14} className="text-success" /> : <Copy size={14} />}
            </button>
          </div>
          <p className="text-sm text-gray-500 dark:text-slate-400">
            Hạn kích hoạt: <span className="font-medium text-gray-700 dark:text-slate-300">{formatDateTime(activation.expires_at)}</span>
            {remaining && <> · còn {remaining}</>}
          </p>
          <p className="text-xs text-gray-400 dark:text-slate-500">
            Khách hàng quét QR (hoặc nhập mã) trong ứng dụng Smart Home để trở thành chủ nhà.
          </p>
          <div className="flex justify-center gap-2 pt-1 sm:justify-start">
            <button type="button" onClick={() => window.print()} className={BTN_PRIMARY}>
              <Printer className="h-3.5 w-3.5" /> In tem
            </button>
            <button type="button" onClick={handleCopy} className={BTN_SECONDARY}>
              <Copy className="h-3.5 w-3.5" /> {copied ? "Đã sao chép" : "Sao chép mã"}
            </button>
          </div>
        </div>
      </div>

      <ActivationPrintLabel activation={activation} homeName={homeName} packageCode={packageCode} />
    </div>
  );
}
