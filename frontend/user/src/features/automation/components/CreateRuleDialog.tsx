"use client";

import { FormEvent, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@smarthome/shared/ui/Dialog";
import { createAutomation, type HomeOverview } from "@smarthome/shared/mock/portal";
import type { AutomationRule } from "@smarthome/shared/mock/types";
import { useCurrentHome } from "@/features/home/providers/CurrentHomeProvider";
import { portalErrorMessage } from "@/lib/errors";

const fieldClass =
  "h-9 w-full rounded border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 text-sm text-gray-900 dark:text-slate-100 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/15";

type Props = {
  overview: HomeOverview;
  onClose: () => void;
  onCreated: () => void;
};

export default function CreateRuleDialog({ overview, onClose, onCreated }: Props) {
  const { customerId } = useCurrentHome();
  const rooms = overview.rooms.filter((r) => r.has_climate_data);
  const targets = overview.devices.filter((d) => d.power !== null);

  const [name, setName] = useState("");
  const [roomId, setRoomId] = useState(rooms[0]?.id ?? 0);
  const [metric, setMetric] = useState<AutomationRule["trigger_metric"]>("temperature");
  const [operator, setOperator] = useState<AutomationRule["trigger_operator"]>(">");
  const [threshold, setThreshold] = useState("30");
  const [deviceId, setDeviceId] = useState(targets[0]?.id ?? 0);
  const [command, setCommand] = useState<AutomationRule["action_command"]>("turn_on");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    const value = Number(threshold);
    if (!name.trim() || !roomId || !deviceId || Number.isNaN(value)) {
      setError("Vui lòng đặt tên, chọn phòng, thiết bị và nhập ngưỡng là một con số.");
      return;
    }
    setSubmitting(true);
    try {
      await createAutomation(customerId, overview.home.id, {
        name, trigger_room_id: roomId, trigger_metric: metric, trigger_operator: operator,
        trigger_threshold: value, action_device_id: deviceId, action_command: command,
      });
      onCreated();
    } catch (err) {
      setError(portalErrorMessage(err));
      setSubmitting(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Tạo quy tắc tự động hoá</DialogTitle></DialogHeader>
        {rooms.length === 0 || targets.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-slate-400">
            Nhà cần ít nhất một phòng có cảm biến và một thiết bị bật/tắt được để tạo quy tắc.
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-gray-600 dark:text-slate-300">Tên quy tắc</span>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="VD: Phòng ngủ nóng → bật điều hoà" className={fieldClass} />
            </label>

            <fieldset className="rounded border border-gray-100 dark:border-slate-700 p-3">
              <legend className="px-1 text-xs font-semibold text-gray-500 dark:text-slate-400">NẾU</legend>
              <div className="grid grid-cols-2 gap-2">
                <select value={roomId} onChange={(e) => setRoomId(Number(e.target.value))} className={fieldClass} aria-label="Phòng">
                  {rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
                <select value={metric} onChange={(e) => setMetric(e.target.value as AutomationRule["trigger_metric"])} className={fieldClass} aria-label="Chỉ số">
                  <option value="temperature">Nhiệt độ (°C)</option>
                  <option value="humidity">Độ ẩm (%)</option>
                  <option value="power_usage">Công suất (W)</option>
                </select>
                <select value={operator} onChange={(e) => setOperator(e.target.value as AutomationRule["trigger_operator"])} className={fieldClass} aria-label="Điều kiện">
                  <option value=">">lớn hơn</option>
                  <option value="<">nhỏ hơn</option>
                  <option value="=">bằng</option>
                </select>
                <input type="number" value={threshold} onChange={(e) => setThreshold(e.target.value)} className={fieldClass} aria-label="Ngưỡng" />
              </div>
            </fieldset>

            <fieldset className="rounded border border-gray-100 dark:border-slate-700 p-3">
              <legend className="px-1 text-xs font-semibold text-gray-500 dark:text-slate-400">THÌ</legend>
              <div className="grid grid-cols-2 gap-2">
                <select value={command} onChange={(e) => setCommand(e.target.value as AutomationRule["action_command"])} className={fieldClass} aria-label="Hành động">
                  <option value="turn_on">Bật</option>
                  <option value="turn_off">Tắt</option>
                </select>
                <select value={deviceId} onChange={(e) => setDeviceId(Number(e.target.value))} className={fieldClass} aria-label="Thiết bị">
                  {targets.map((d) => <option key={d.id} value={d.id}>{d.device_name} · {d.room_name}</option>)}
                </select>
              </div>
            </fieldset>

            {error && <p className="rounded border border-critical/30 bg-critical-soft px-3 py-2 text-sm text-critical">{error}</p>}

            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={onClose} className="rounded border border-gray-200 dark:border-slate-600 px-4 py-1.5 text-sm font-medium text-gray-600 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700">
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
