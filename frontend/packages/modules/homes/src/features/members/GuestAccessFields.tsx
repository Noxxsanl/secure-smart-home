"use client";

import type { CustomerDevice } from "@shh/api-client/portal";
import { formatDate } from "@shh/utils";
import { GUEST_DURATIONS } from "../../model/guest";

const fieldClass =
  "h-9 w-full rounded border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 text-sm text-gray-900 dark:text-slate-100 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/15";

type GuestAccessFieldsProps = {
  /** Thiết bị của nhà (không gồm gateway) để chọn quyền truy cập. */
  devices: CustomerDevice[];
  /** Số ngày hiệu lực, hoặc "keep" để giữ hạn hiện tại khi sửa một khách đang có. */
  days: number | "keep";
  onDaysChange: (days: number | "keep") => void;
  selectedIds: number[];
  onSelectedIdsChange: (ids: number[]) => void;
  /** Hạn hiện tại của khách (khi sửa) — có thì thêm lựa chọn "Giữ nguyên". */
  currentExpiry?: string | null;
  idPrefix: string;
};

// Phần riêng của vai trò Khách: thời hạn + danh sách thiết bị được phép (đa chọn).
export default function GuestAccessFields({
  devices, days, onDaysChange, selectedIds, onSelectedIdsChange, currentExpiry, idPrefix,
}: GuestAccessFieldsProps) {
  const allSelected = devices.length > 0 && devices.every((d) => selectedIds.includes(d.id));

  function toggle(id: number) {
    onSelectedIdsChange(selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id]);
  }

  return (
    <div className="space-y-3 rounded border border-gray-100 dark:border-slate-700 p-3">
      <div>
        <label htmlFor={`${idPrefix}-duration`} className="mb-1 block text-xs font-semibold text-gray-600 dark:text-slate-300">
          Thời hạn truy cập (tối đa 30 ngày)
        </label>
        <select
          id={`${idPrefix}-duration`}
          value={String(days)}
          onChange={(e) => onDaysChange(e.target.value === "keep" ? "keep" : Number(e.target.value))}
          className={fieldClass}
        >
          {currentExpiry && <option value="keep">Giữ nguyên (đến {formatDate(currentExpiry)})</option>}
          {GUEST_DURATIONS.map((d) => (
            <option key={d.days} value={d.days}>{d.label} kể từ bây giờ</option>
          ))}
        </select>
      </div>

      <fieldset>
        <legend className="mb-1 flex w-full items-center justify-between text-xs font-semibold text-gray-600 dark:text-slate-300">
          <span>Thiết bị được phép ({selectedIds.length}/{devices.length})</span>
          {devices.length > 0 && (
            <button
              type="button"
              onClick={() => onSelectedIdsChange(allSelected ? [] : devices.map((d) => d.id))}
              className="font-semibold text-brand hover:brightness-90"
            >
              {allSelected ? "Bỏ chọn tất cả" : "Chọn tất cả"}
            </button>
          )}
        </legend>
        {devices.length === 0 ? (
          <p className="text-xs text-gray-400 dark:text-slate-500">Nhà chưa có thiết bị nào để cấp quyền.</p>
        ) : (
          <ul className="max-h-44 space-y-1 overflow-y-auto">
            {devices.map((d) => (
              <li key={d.id}>
                <label className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-sm text-gray-700 hover:bg-gray-50 dark:text-slate-300 dark:hover:bg-slate-700/50">
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(d.id)}
                    onChange={() => toggle(d.id)}
                    className="h-4 w-4 accent-brand"
                  />
                  <span className="min-w-0 flex-1 truncate">{d.device_name}</span>
                  <span className="shrink-0 text-xs text-gray-400 dark:text-slate-500">{d.room_name ?? "Chưa gán phòng"}</span>
                </label>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-1 text-[11px] text-gray-400 dark:text-slate-500">
          Khách chỉ thấy và điều khiển các thiết bị này, và mất quyền khi hết hạn.
        </p>
      </fieldset>
    </div>
  );
}
