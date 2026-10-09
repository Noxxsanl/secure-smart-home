"use client";

import { createPortal } from "react-dom";
import QrCode from "@smarthome/console/components/QrCode";
import { formatDate } from "@smarthome/console/lib/format";
import type { ActivationCodeIssued, PackageCode } from "@smarthome/console/api/types";

// FR-2.5: tem in (QR + mã + tên nhà + gói). Portal thẳng vào <body> và chỉ hiện
// khi in: lúc in mọi phần tử khác của <body> bị ẩn, nên window.print() chỉ ra
// đúng tấm tem. Màu cố định đen/trắng — không theo dark mode.
const PRINT_CSS = `
@media screen { .sh-print-root { display: none !important; } }
@media print {
  @page { margin: 12mm; }
  html, body { background: #ffffff !important; height: auto !important; min-height: 0 !important; overflow: visible !important; }
  body > *:not(.sh-print-root) { display: none !important; }
  .sh-print-root { display: block !important; }
}
`;

type ActivationPrintLabelProps = {
  activation: ActivationCodeIssued;
  homeName: string;
  packageCode: PackageCode;
};

export default function ActivationPrintLabel({ activation, homeName, packageCode }: ActivationPrintLabelProps) {
  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="sh-print-root">
      <style>{PRINT_CSS}</style>
      <div
        style={{
          width: "90mm",
          border: "1px dashed #000",
          borderRadius: "3mm",
          padding: "5mm",
          color: "#000",
          background: "#fff",
          fontFamily: "Arial, Helvetica, sans-serif",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "3mm" }}>
          <span style={{ fontSize: "11pt", fontWeight: 700 }}>Smart Home</span>
          <span style={{ fontSize: "9pt", fontWeight: 700, border: "1px solid #000", borderRadius: "1mm", padding: "0.5mm 1.5mm" }}>
            {packageCode}
          </span>
        </div>
        <div style={{ fontSize: "10pt", marginTop: "1mm", wordBreak: "break-word" }}>{homeName}</div>

        <div style={{ display: "flex", gap: "4mm", alignItems: "center", marginTop: "3mm" }}>
          <QrCode value={activation.qr_payload} size="32mm" />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: "8pt", textTransform: "uppercase", letterSpacing: "0.5pt" }}>Mã kích hoạt</div>
            <div style={{ fontFamily: "'Courier New', monospace", fontSize: "13pt", fontWeight: 700, letterSpacing: "1pt", marginTop: "1mm" }}>
              {activation.code}
            </div>
            <div style={{ fontSize: "8pt", marginTop: "2mm" }}>Hạn kích hoạt: {formatDate(activation.expires_at)}</div>
          </div>
        </div>

        <div style={{ fontSize: "8pt", marginTop: "3mm", lineHeight: 1.35 }}>
          Mở ứng dụng Smart Home → Thêm nhà → quét QR hoặc nhập mã. Giữ kín tem này cho tới khi bàn giao cho khách hàng.
        </div>
      </div>
    </div>,
    document.body
  );
}
