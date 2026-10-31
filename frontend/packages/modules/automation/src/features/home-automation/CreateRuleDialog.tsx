"use client";

import { FormEvent, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@shh/ui";
import { createAutomation } from "../../api/portalAutomation.api";
import type { CreateAutomationInput, DeviceAction, HomeOverview, TriggerMetric, TriggerOperator, TriggerType } from "@shh/api-client/portal";
import { portalErrorMessage } from "@shh/api-client/portal";
import { WEEKDAYS } from "../../model/schedule";
import { timezoneLabel } from "../../model/describe";

const fieldClass =
  "h-9 w-full rounded border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 text-sm text-gray-900 dark:text-slate-100 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/15";

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const ALL_DAYS = [1, 2, 3, 4, 5, 6, 7];

const DAY_PRESETS: { label: string; days: number[] }[] = [
  { label: "Mọi ngày", days: ALL_DAYS },
  { label: "T2–T6", days: [1, 2, 3, 4, 5] },
  { label: "Cuối tuần", days: [6, 7] },
];

const CREATE_ERRORS: Record<string, string> = {
  INVALID_INPUT:
    "Quy tắc chưa hợp lệ. Kiểm tra lại phòng có cảm biến, thiết bị bật/tắt, ngưỡng (là một con số) hoặc giờ và ngày chạy.",
  FORBIDDEN: "Vai trò của bạn không được tạo quy tắc tự động hoá. Hãy nhờ chủ nhà (Owner) cấp quyền.",
};

type CreateRuleDialogProps = {
  overview: HomeOverview;
  onClose: () => void;
  onCreated: () => void | Promise<void>;
};

// POST /homes/:id/automations — hai loại: cảm biến vượt ngưỡng (NẾU … THÌ …) và theo lịch (HH:MM + thứ).
// Quy tắc chỉ điều khiển relay (thiết bị bật/tắt được); backend kiểm tra lại mọi ràng buộc.
export default function CreateRuleDialog({ overview, onClose, onCreated }: CreateRuleDialogProps) {
  const devices = overview.devices.filter((d) => d.category !== "gateway");
  const sensorRoomIds = new Set(devices.filter((d) => d.category === "sensor" && d.room_id !== null).map((d) => d.room_id));
  // Phòng có cảm biến nhiệt/ẩm (kể cả khi chưa có số đo đầu tiên).
  const rooms = overview.rooms.filter((r) => sensorRoomIds.has(r.id) || r.has_climate_data);
  const relays = devices.filter((d) => d.category === "relay");

  const [name, setName] = useState("");
  const [triggerType, setTriggerType] = useState<TriggerType>(rooms.length > 0 ? "sensor_threshold" : "schedule");
  const [roomId, setRoomId] = useState(rooms[0]?.id ?? 0);
  const [metric, setMetric] = useState<TriggerMetric>("temperature");
  const [operator, setOperator] = useState<TriggerOperator>(">");
  const [threshold, setThreshold] = useState("30");
  const [time, setTime] = useState("22:00");
  const [days, setDays] = useState<number[]>(ALL_DAYS);
  const [deviceId, setDeviceId] = useState(relays[0]?.id ?? 0);
  const [command, setCommand] = useState<DeviceAction>("turn_on");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function toggleDay(day: number) {
    setDays((prev) => (prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    const cleanName = name.trim();
    if (!cleanName || cleanName.length > 128) return setError("Hãy đặt tên quy tắc (tối đa 128 ký tự).");
    if (!deviceId) return setError("Hãy chọn thiết bị sẽ được bật/tắt.");

    let input: CreateAutomationInput;
    if (triggerType === "sensor_threshold") {
      const value = Number(threshold);
      if (!roomId) return setError("Hãy chọn phòng có cảm biến.");
      if (threshold.trim() === "" || !Number.isFinite(value)) return setError("Ngưỡng cần là một con số, VD 30.");
      if (metric === "humidity" && (value < 0 || value > 100)) return setError("Ngưỡng độ ẩm cần nằm trong khoảng 0–100%.");
      input = {
        name: cleanName, trigger_type: "sensor_threshold", trigger_room_id: roomId, trigger_metric: metric,
        trigger_operator: operator, trigger_threshold: value, action_device_id: deviceId, action_command: command,
      };
    } else {
      if (!TIME_PATTERN.test(time)) return setError("Hãy chọn giờ chạy theo dạng HH:MM, VD 22:30.");
      if (days.length === 0) return setError("Hãy chọn ít nhất một ngày trong tuần.");
      input = {
        name: cleanName, trigger_type: "schedule", schedule_time: time,
        schedule_days: [...days].sort((a, b) => a - b), action_device_id: deviceId, action_command: command,
      };
    }

    setSubmitting(true);
    try {
      await createAutomation(overview.home.id, input);
      await onCreated();
    } catch (err) {
      setError(portalErrorMessage(err, CREATE_ERRORS));
      setSubmitting(false);
    }
  }

  const chipClass = (active: boolean) =>
    `rounded px-3 py-1.5 text-xs font-semibold transition ${
      active
        ? "bg-brand text-white"
        : "border border-gray-200 text-gray-500 hover:bg-gray-50 dark:border-slate-600 dark:text-slate-400 dark:hover:bg-slate-700"
    }`;

  return (
    <Dialog open onOpenChange={(open) => !open && !submitting && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Tạo quy tắc tự động hoá</DialogTitle></DialogHeader>
        {relays.length === 0 ? (
          <div className="space-y-4">
            <p className="text-sm text-gray-500 dark:text-slate-400">
              Nhà cần ít nhất một thiết bị bật/tắt được (relay như đèn, quạt) để tạo quy tắc.
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
              <span className="mb-1 block font-medium text-gray-600 dark:text-slate-300">Tên quy tắc</span>
              <input
                value={name} onChange={(e) => setName(e.target.value)} maxLength={128}
                placeholder={triggerType === "schedule" ? "VD: Tắt đèn bếp lúc 23:30" : "VD: Phòng ngủ nóng → bật quạt"}
                className={fieldClass}
              />
            </label>

            <div className="flex gap-1.5" role="group" aria-label="Kiểu kích hoạt">
              <button type="button" aria-pressed={triggerType === "sensor_threshold"} disabled={rooms.length === 0}
                onClick={() => setTriggerType("sensor_threshold")} className={`${chipClass(triggerType === "sensor_threshold")} disabled:opacity-40`}>
                Khi cảm biến vượt ngưỡng
              </button>
              <button type="button" aria-pressed={triggerType === "schedule"} onClick={() => setTriggerType("schedule")} className={chipClass(triggerType === "schedule")}>
                Theo lịch
              </button>
            </div>
            {rooms.length === 0 && (
              <p className="text-xs text-gray-400 dark:text-slate-500">Nhà chưa có phòng nào có cảm biến nhiệt/ẩm nên chỉ tạo được quy tắc theo lịch.</p>
            )}

            {triggerType === "sensor_threshold" ? (
              <fieldset className="rounded border border-gray-100 dark:border-slate-700 p-3">
                <legend className="px-1 text-xs font-semibold text-gray-500 dark:text-slate-400">NẾU</legend>
                <div className="grid grid-cols-2 gap-2">
                  <select value={roomId} onChange={(e) => setRoomId(Number(e.target.value))} className={fieldClass} aria-label="Phòng">
                    {rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                  </select>
                  <select value={metric} onChange={(e) => setMetric(e.target.value as TriggerMetric)} className={fieldClass} aria-label="Chỉ số">
                    <option value="temperature">Nhiệt độ (°C)</option>
                    <option value="humidity">Độ ẩm (%)</option>
                  </select>
                  <select value={operator} onChange={(e) => setOperator(e.target.value as TriggerOperator)} className={fieldClass} aria-label="Điều kiện">
                    <option value=">">lớn hơn</option>
                    <option value="<">nhỏ hơn</option>
                    <option value="=">bằng</option>
                  </select>
                  <input type="number" step="any" inputMode="decimal" value={threshold} onChange={(e) => setThreshold(e.target.value)} className={fieldClass} aria-label="Ngưỡng" />
                </div>
                <p className="mt-2 text-[11px] text-gray-400 dark:text-slate-500">
                  Quy tắc chạy một lần mỗi khi điều kiện chuyển từ không đạt sang đạt, không lặp liên tục.
                </p>
              </fieldset>
            ) : (
              <fieldset className="rounded border border-gray-100 dark:border-slate-700 p-3">
                <legend className="px-1 text-xs font-semibold text-gray-500 dark:text-slate-400">LÚC</legend>
                <div className="space-y-2">
                  <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className={fieldClass} aria-label="Giờ chạy" />
                  <div className="flex flex-wrap gap-1.5" role="group" aria-label="Các ngày trong tuần">
                    {WEEKDAYS.map((w) => (
                      <button key={w.value} type="button" aria-pressed={days.includes(w.value)} onClick={() => toggleDay(w.value)} className={`${chipClass(days.includes(w.value))} min-w-10`}>
                        {w.short}
                      </button>
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-3 text-xs">
                    {DAY_PRESETS.map((p) => (
                      <button key={p.label} type="button" onClick={() => setDays(p.days)} className="font-semibold text-brand hover:brightness-90">
                        {p.label}
                      </button>
                    ))}
                  </div>
                  <p className="text-[11px] text-gray-400 dark:text-slate-500">Giờ tính theo múi giờ của nhà: {timezoneLabel(overview.home.timezone)}.</p>
                </div>
              </fieldset>
            )}

            <fieldset className="rounded border border-gray-100 dark:border-slate-700 p-3">
              <legend className="px-1 text-xs font-semibold text-gray-500 dark:text-slate-400">THÌ</legend>
              <div className="grid grid-cols-2 gap-2">
                <select value={command} onChange={(e) => setCommand(e.target.value as DeviceAction)} className={fieldClass} aria-label="Hành động">
                  <option value="turn_on">Bật</option>
                  <option value="turn_off">Tắt</option>
                </select>
                <select value={deviceId} onChange={(e) => setDeviceId(Number(e.target.value))} className={fieldClass} aria-label="Thiết bị">
                  {relays.map((d) => <option key={d.id} value={d.id}>{d.device_name}{d.room_name ? ` · ${d.room_name}` : ""}</option>)}
                </select>
              </div>
            </fieldset>

            {error && <p role="alert" className="rounded border border-critical/30 bg-critical-soft px-3 py-2 text-sm text-critical">{error}</p>}

            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={onClose} disabled={submitting} className="rounded border border-gray-200 dark:border-slate-600 px-4 py-1.5 text-sm font-medium text-gray-600 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700 disabled:opacity-50">
                Huỷ
              </button>
              <button type="submit" disabled={submitting} className="rounded bg-brand px-4 py-1.5 text-sm font-semibold text-white transition hover:brightness-90 disabled:opacity-50">
                {submitting ? "Đang lưu…" : "Tạo quy tắc"}
              </button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
