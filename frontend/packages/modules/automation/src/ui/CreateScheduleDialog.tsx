"use client";

import { FormEvent, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@shh/ui";
import { nowMs, useNow } from "@shh/utils";
import { portalErrorMessage } from "@shh/api-client/portal";
import type { ScheduleInput } from "@shh/api-client/portal";
import {
  APPLIANCE_NAMES, SCHEDULE_AFTER_MAX, SCHEDULE_AFTER_MIN, SCHEDULE_AFTER_PRESETS, SCHEDULE_CHOICES, SCHEDULE_ERRORS,
  SCHEDULE_TEMP_DEFAULT, SCHEDULE_TEMP_MAX, SCHEDULE_TEMP_MIN, addDays, buildWhen, defaultTime, previewWhen, todayKey,
  type DateChoice, type SchedulableDevice, type WhenMode,
} from "../model/scheduledAction";

const fieldClass =
  "h-9 w-full rounded border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 text-sm text-gray-900 dark:text-slate-100 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/15";

const chipClass = (active: boolean) =>
  `rounded px-3 py-1.5 text-xs font-semibold transition ${
    active
      ? "bg-brand text-white"
      : "border border-gray-200 text-gray-500 hover:bg-gray-50 dark:border-slate-600 dark:text-slate-400 dark:hover:bg-slate-700"
  }`;

const DATE_CHOICES: { value: DateChoice; label: string }[] = [
  { value: "next", label: "Lần tới" },
  { value: "tomorrow", label: "Ngày mai" },
  { value: "pick", label: "Chọn ngày" },
];

type CreateScheduleDialogProps = {
  /** Thiết bị hẹn giờ được (đã lọc theo loại + quyền). */
  devices: SchedulableDevice[];
  /** Múi giờ IANA của nhà — giờ nhập vào tính theo múi giờ này. */
  timezone: string;
  /** Thiết bị chọn sẵn (mở từ trang chi tiết thiết bị). */
  defaultDeviceId?: number;
  /** Gọi API tạo lịch; ném lỗi thì hộp thoại hiện câu tiếng Việt và giữ nguyên dữ liệu đã nhập. */
  onSubmit: (input: ScheduleInput) => Promise<void>;
  onClose: () => void;
};

// Hẹn giờ một lần: thiết bị + thao tác theo loại + thời điểm ("Lúc HH:MM" hoặc "Sau N phút").
// Component chỉ hiển thị: việc gọi API do feature truyền vào qua `onSubmit`; backend kiểm tra lại mọi ràng buộc.
export default function CreateScheduleDialog({ devices, timezone, defaultDeviceId, onSubmit, onClose }: CreateScheduleDialogProps) {
  const now = useNow(10_000);
  const first = devices.find((d) => d.id === defaultDeviceId) ?? devices[0];

  const [deviceId, setDeviceId] = useState(first?.id ?? 0);
  const [choiceKey, setChoiceKey] = useState("");
  const [temperature, setTemperature] = useState(String(SCHEDULE_TEMP_DEFAULT));
  const [mode, setMode] = useState<WhenMode>("at");
  const [time, setTime] = useState(() => defaultTime(timezone, nowMs()));
  const [dateChoice, setDateChoice] = useState<DateChoice>("next");
  const [pickedDate, setPickedDate] = useState("");
  const [afterMinutes, setAfterMinutes] = useState("30");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const device = devices.find((d) => d.id === deviceId);
  const choices = device ? SCHEDULE_CHOICES[device.appliance] : [];
  const choice = choices.find((c) => c.key === choiceKey) ?? choices[0];

  const today = todayKey(timezone, now);
  const when = buildWhen({ mode, time, dateChoice, pickedDate, afterMinutes }, timezone, now);
  const preview = previewWhen(when, timezone, now);

  // Nhóm theo phòng để danh sách dài vẫn dễ chọn.
  const groups = new Map<string, SchedulableDevice[]>();
  for (const d of devices) {
    const room = d.roomName ?? "Chưa gán phòng";
    groups.set(room, [...(groups.get(room) ?? []), d]);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (!device || !choice) return setError("Hãy chọn thiết bị cần hẹn giờ.");

    let tempValue: number | undefined;
    if (choice.needsTemperature) {
      tempValue = Number(temperature);
      if (!/^\d+$/.test(temperature.trim()) || tempValue < SCHEDULE_TEMP_MIN || tempValue > SCHEDULE_TEMP_MAX) {
        return setError(`Nhiệt độ điều hoà cần là số nguyên từ ${SCHEDULE_TEMP_MIN} đến ${SCHEDULE_TEMP_MAX} °C.`);
      }
    }

    if (!when) {
      return setError(
        mode === "after"
          ? `Hãy nhập số phút từ ${SCHEDULE_AFTER_MIN} đến ${SCHEDULE_AFTER_MAX} (tối đa 7 ngày).`
          : dateChoice === "pick" && !pickedDate
            ? "Hãy chọn ngày chạy."
            : "Hãy chọn giờ chạy theo dạng HH:MM, VD 20:00.",
      );
    }
    // set_pos: vị trí 0 (đóng) vẫn phải gửi, nên kiểm `!== undefined` chứ không kiểm truthy.
    const input: ScheduleInput = {
      device_id: device.id,
      action: choice.action,
      ...(tempValue !== undefined ? { temperature: tempValue } : {}),
      ...(choice.position !== undefined ? { position: choice.position } : {}),
      when,
    };

    setSubmitting(true);
    try {
      await onSubmit(input);
    } catch (err) {
      setError(portalErrorMessage(err, SCHEDULE_ERRORS));
      setSubmitting(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !submitting && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Thêm hẹn giờ</DialogTitle></DialogHeader>
        {devices.length === 0 ? (
          <div className="space-y-4">
            <p className="text-sm text-gray-500 dark:text-slate-400">
              Chưa có thiết bị nào hẹn giờ được. Hẹn giờ dùng cho đèn, quạt, rèm cửa và điều hoà mà bạn có quyền điều khiển.
            </p>
            <div className="flex justify-end">
              <button type="button" onClick={onClose} className="rounded border border-gray-200 dark:border-slate-600 px-4 py-1.5 text-sm font-medium text-gray-600 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700">
                Đóng
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} noValidate className="space-y-3">
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-gray-600 dark:text-slate-300">Thiết bị</span>
              <select value={deviceId} onChange={(e) => setDeviceId(Number(e.target.value))} className={fieldClass}>
                {[...groups.entries()].map(([room, list]) => (
                  <optgroup key={room} label={room}>
                    {list.map((d) => <option key={d.id} value={d.id}>{d.name} ({APPLIANCE_NAMES[d.appliance]})</option>)}
                  </optgroup>
                ))}
              </select>
            </label>

            <fieldset className="rounded border border-gray-100 dark:border-slate-700 p-3">
              <legend className="px-1 text-xs font-semibold text-gray-500 dark:text-slate-400">THAO TÁC</legend>
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="Thao tác">
                {choices.map((c) => (
                  <button key={c.key} type="button" aria-pressed={choice?.key === c.key} onClick={() => setChoiceKey(c.key)} className={chipClass(choice?.key === c.key)}>
                    {c.label}
                  </button>
                ))}
              </div>
              {choice?.needsTemperature && (
                <label className="mt-2 flex items-center gap-2 text-sm text-gray-600 dark:text-slate-300">
                  Nhiệt độ
                  <input
                    type="number" inputMode="numeric" min={SCHEDULE_TEMP_MIN} max={SCHEDULE_TEMP_MAX} step={1}
                    value={temperature} onChange={(e) => setTemperature(e.target.value)} className={`${fieldClass} w-24`} aria-label="Nhiệt độ đặt (°C)"
                  />
                  °C
                </label>
              )}
            </fieldset>

            <fieldset className="rounded border border-gray-100 dark:border-slate-700 p-3">
              <legend className="px-1 text-xs font-semibold text-gray-500 dark:text-slate-400">THỜI ĐIỂM</legend>
              <div className="space-y-2">
                <div className="flex gap-1.5" role="group" aria-label="Kiểu hẹn giờ">
                  <button type="button" aria-pressed={mode === "at"} onClick={() => setMode("at")} className={chipClass(mode === "at")}>Lúc</button>
                  <button type="button" aria-pressed={mode === "after"} onClick={() => setMode("after")} className={chipClass(mode === "after")}>Sau</button>
                </div>

                {mode === "at" ? (
                  <>
                    <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className={fieldClass} aria-label="Giờ chạy" />
                    <div className="flex flex-wrap gap-1.5" role="group" aria-label="Ngày chạy">
                      {DATE_CHOICES.map((c) => (
                        <button key={c.value} type="button" aria-pressed={dateChoice === c.value} onClick={() => setDateChoice(c.value)} className={chipClass(dateChoice === c.value)}>
                          {c.label}
                        </button>
                      ))}
                    </div>
                    {dateChoice === "pick" && (
                      <input
                        type="date" value={pickedDate} min={today} max={addDays(today, 7)}
                        onChange={(e) => setPickedDate(e.target.value)} className={fieldClass} aria-label="Ngày chạy"
                      />
                    )}
                    <p className="text-[11px] text-gray-400 dark:text-slate-500">
                      “Lần tới” chạy hôm nay nếu giờ đó chưa qua, nếu không thì ngày mai. Giờ tính theo múi giờ của nhà ({timezone}).
                    </p>
                  </>
                ) : (
                  <>
                    <div className="flex flex-wrap gap-1.5" role="group" aria-label="Chọn nhanh">
                      {SCHEDULE_AFTER_PRESETS.map((m) => (
                        <button key={m} type="button" aria-pressed={afterMinutes === String(m)} onClick={() => setAfterMinutes(String(m))} className={chipClass(afterMinutes === String(m))}>
                          {m} phút
                        </button>
                      ))}
                    </div>
                    <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-slate-300">
                      Hoặc nhập
                      <input
                        type="number" inputMode="numeric" min={SCHEDULE_AFTER_MIN} max={SCHEDULE_AFTER_MAX} step={1}
                        value={afterMinutes} onChange={(e) => setAfterMinutes(e.target.value)} className={`${fieldClass} w-28`} aria-label="Số phút"
                      />
                      phút (tối đa 7 ngày = {SCHEDULE_AFTER_MAX} phút)
                    </label>
                  </>
                )}
              </div>
            </fieldset>

            <p role="status" className="rounded bg-gray-50 px-3 py-2 text-sm text-gray-700 dark:bg-slate-900/50 dark:text-slate-300">
              {preview ? <>Sẽ chạy: <span className="font-semibold">{preview}</span></> : "Chọn thời điểm để xem giờ chạy dự kiến."}
            </p>

            {error && <p role="alert" className="rounded border border-critical/30 bg-critical-soft px-3 py-2 text-sm text-critical">{error}</p>}

            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={onClose} disabled={submitting} className="rounded border border-gray-200 dark:border-slate-600 px-4 py-1.5 text-sm font-medium text-gray-600 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700 disabled:opacity-50">
                Huỷ
              </button>
              <button type="submit" disabled={submitting} className="rounded bg-brand px-4 py-1.5 text-sm font-semibold text-white transition hover:brightness-90 disabled:opacity-50">
                {submitting ? "Đang lưu…" : "Tạo hẹn giờ"}
              </button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
