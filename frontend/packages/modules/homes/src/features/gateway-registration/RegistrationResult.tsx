"use client";

import Link from "next/link";
import { CheckCircle2, Info } from "lucide-react";
import { BTN_PRIMARY, BTN_SECONDARY, CARD, TABLE_HEAD_ROW, TH } from "@shh/ui";
import type { RegisterGatewayResult, RegisteredDevice } from "@shh/api-client/dashboard";

const CATEGORY_TEXT: Record<RegisteredDevice["category"], string> = {
  gateway: "Gateway",
  sensor: "Cảm biến nhiệt/ẩm",
  camera: "Camera",
  relay: "Thiết bị điều khiển",
};

type RegistrationResultProps = {
  result: RegisterGatewayResult;
  onReset: () => void;
};

export default function RegistrationResult({ result, onReset }: RegistrationResultProps) {
  const { home, owner, devices } = result;
  return (
    <div className={`${CARD} space-y-4 p-5`}>
      <div className="flex items-start gap-2.5 rounded border border-success/30 bg-success-soft px-3 py-2.5 text-sm text-success">
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
        <p>
          Đã đăng ký <span className="font-semibold">{devices.length} thiết bị</span> vào nhà{" "}
          <span className="font-semibold">{home.name}</span> {home.created ? "(nhà mới)" : "(nhà đã có)"} của{" "}
          <span className="font-semibold">{owner.name}</span> <span className="font-mono text-xs">({owner.user_tag})</span>.
          Khách thấy ngay các thiết bị này trên cổng khách hàng và ứng dụng.
        </p>
      </div>

      <div className="overflow-x-auto rounded border border-gray-100 dark:border-slate-700">
        <table className="min-w-full table-auto text-left text-sm">
          <thead>
            <tr className={TABLE_HEAD_ROW}>
              <th className={TH}>Thiết bị</th>
              <th className={TH}>Device ID</th>
              <th className={TH}>Loại</th>
              <th className={TH}>Phòng</th>
              <th className={TH}>Ghi chú</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
            {devices.map((d) => (
              <tr key={d.id} className="bg-white dark:bg-slate-800">
                <td className="px-4 py-2 font-medium text-gray-900 dark:text-slate-100">{d.device_name}</td>
                <td className="px-4 py-2 font-mono text-xs text-gray-600 dark:text-slate-300">{d.device_id}</td>
                <td className="px-4 py-2 text-gray-600 dark:text-slate-300">{CATEGORY_TEXT[d.category]}</td>
                <td className="px-4 py-2 text-gray-600 dark:text-slate-300">{d.room_name ?? "—"}</td>
                <td className="px-4 py-2 text-xs text-gray-500 dark:text-slate-400">
                  {[d.is_simulated && "Mô phỏng (chưa có phần cứng nhận lệnh)", d.unblocked && "Đã mở khoá"].filter(Boolean).join(" · ") || "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-start gap-2.5 rounded border border-gray-200 dark:border-slate-600 bg-gray-50 dark:bg-slate-900 px-3 py-2.5 text-sm text-gray-600 dark:text-slate-300">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
        <p>
          Gateway cần biết nhà của mình để gửi heartbeat và sự kiện camera: ghi{" "}
          <span className="font-mono font-semibold">cloud/home_id = {home.id}</span> vào NVS của gateway rồi nạp lại NVS
          (xem docs/guides/LEN_SERVER.md, mục 5). Nhiệt độ/độ ẩm và ảnh camera vẫn lên server khi chưa ghi.
        </p>
      </div>

      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" onClick={onReset} className={BTN_SECONDARY}>Đăng ký gateway khác</button>
        <Link href={`/smart-homes/${home.id}`} className={BTN_PRIMARY}>Xem nhà</Link>
      </div>
    </div>
  );
}
