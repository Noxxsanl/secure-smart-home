"use client";

import { useMemo, useState } from "react";
import { Plus, Trash2, Zap } from "lucide-react";
import { useAutomation } from "@/features/automation/hooks/useAutomation";
import { useToast } from "@/shared/ui/Toast";
import EmptyState from "@/shared/ui/EmptyState";
import ConfirmDialog from "@/shared/ui/ConfirmDialog";
import { smartHomeStore, roomStore, deviceStore } from "@/shared/mock/store";
import type { AutomationRule } from "@/shared/mock/types";

const METRIC_LABELS: Record<AutomationRule["trigger_metric"], string> = {
  temperature: "Nhiệt độ", humidity: "Độ ẩm", power_usage: "Công suất",
};

export default function AutomationPage() {
  const { rows, isLoading, toggle, remove, create } = useAutomation();
  const { showToast } = useToast();
  const [deleteTarget, setDeleteTarget] = useState<number | null>(null);

  const homes = smartHomeStore.list();
  const [homeId, setHomeId] = useState<number>(homes[0]?.id ?? 0);
  const rooms = useMemo(() => roomStore.listByHome(homeId), [homeId]);
  const homeDevices = useMemo(() => deviceStore.listByHome(homeId), [homeId]);

  const [roomId, setRoomId] = useState<number>(rooms[0]?.id ?? 0);
  const [metric, setMetric] = useState<AutomationRule["trigger_metric"]>("temperature");
  const [operator, setOperator] = useState<AutomationRule["trigger_operator"]>(">");
  const [threshold, setThreshold] = useState(30);
  const [deviceId, setDeviceId] = useState<number>(homeDevices[0]?.id ?? 0);
  const [command, setCommand] = useState<AutomationRule["action_command"]>("turn_on");

  const effectiveRoomId = roomId || rooms[0]?.id || 0;
  const effectiveDeviceId = deviceId || homeDevices[0]?.id || 0;

  async function handleCreate() {
    if (!homeId || !effectiveRoomId || !effectiveDeviceId) return;
    const room = roomStore.get(effectiveRoomId);
    const device = deviceStore.get(effectiveDeviceId);
    await create({
      home_id: homeId,
      name: `${room?.name ?? "Room"} ${METRIC_LABELS[metric]} ${operator} ${threshold} → ${command === "turn_on" ? "Bật" : "Tắt"} ${device?.device_name ?? ""}`,
      trigger_room_id: effectiveRoomId,
      trigger_metric: metric,
      trigger_operator: operator,
      trigger_threshold: threshold,
      action_device_id: effectiveDeviceId,
      action_command: command,
    });
    showToast("Đã tạo rule tự động hoá mới.");
  }

  async function handleDeleteConfirm() {
    if (deleteTarget === null) return;
    await remove(deleteTarget);
    setDeleteTarget(null);
    showToast("Đã xoá rule.");
  }

  return (
    <div className="w-full space-y-3">
      <div>
        <h1 className="text-lg font-semibold text-gray-900 dark:text-slate-100">Automation Rules</h1>
        <p className="mt-0.5 text-sm text-gray-500 dark:text-slate-400">MVP dạng IF/THEN — 1 điều kiện, 1 hành động.</p>
      </div>

      <div className="rounded-md border border-[#E5EAF0] dark:border-slate-700 bg-white dark:bg-slate-800 p-4">
        <p className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-gray-400 dark:text-slate-500">Tạo Rule mới</p>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="font-semibold text-gray-700 dark:text-slate-300">IF</span>
          <select value={homeId} onChange={(e) => { setHomeId(Number(e.target.value)); setRoomId(0); setDeviceId(0); }}
            className="h-9 rounded border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 px-2.5 text-sm text-gray-900 dark:text-slate-100">
            {homes.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
          </select>
          <select value={effectiveRoomId} onChange={(e) => setRoomId(Number(e.target.value))}
            className="h-9 rounded border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 px-2.5 text-sm text-gray-900 dark:text-slate-100">
            {rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
          <select value={metric} onChange={(e) => setMetric(e.target.value as AutomationRule["trigger_metric"])}
            className="h-9 rounded border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 px-2.5 text-sm text-gray-900 dark:text-slate-100">
            {(Object.keys(METRIC_LABELS) as AutomationRule["trigger_metric"][]).map((m) => <option key={m} value={m}>{METRIC_LABELS[m]}</option>)}
          </select>
          <select value={operator} onChange={(e) => setOperator(e.target.value as AutomationRule["trigger_operator"])}
            className="h-9 rounded border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 px-2.5 text-sm text-gray-900 dark:text-slate-100">
            <option value=">">&gt;</option>
            <option value="<">&lt;</option>
            <option value="=">=</option>
          </select>
          <input type="number" value={threshold} onChange={(e) => setThreshold(Number(e.target.value))}
            className="h-9 w-20 rounded border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 px-2.5 text-sm text-gray-900 dark:text-slate-100" />
        </div>
        <div className="mt-2.5 flex flex-wrap items-center gap-2 text-sm">
          <span className="font-semibold text-gray-700 dark:text-slate-300">THEN</span>
          <select value={command} onChange={(e) => setCommand(e.target.value as AutomationRule["action_command"])}
            className="h-9 rounded border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 px-2.5 text-sm text-gray-900 dark:text-slate-100">
            <option value="turn_on">Bật</option>
            <option value="turn_off">Tắt</option>
          </select>
          <select value={effectiveDeviceId} onChange={(e) => setDeviceId(Number(e.target.value))}
            className="h-9 rounded border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 px-2.5 text-sm text-gray-900 dark:text-slate-100">
            {homeDevices.map((d) => <option key={d.id} value={d.id}>{d.device_name}</option>)}
          </select>
          <button type="button" onClick={handleCreate} disabled={!effectiveRoomId || !effectiveDeviceId}
            className="ml-auto inline-flex items-center gap-1.5 rounded bg-brand px-3.5 py-1.5 text-sm font-semibold text-white transition hover:brightness-90 disabled:opacity-50">
            <Plus className="h-3.5 w-3.5" /> Lưu Rule
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-md border border-[#E5EAF0] dark:border-slate-700 bg-white dark:bg-slate-800">
        <div className="border-b border-gray-100 dark:border-slate-700 bg-[#F4F5F7] dark:bg-slate-900 px-4 py-2">
          <p className="text-sm font-semibold text-gray-900 dark:text-slate-100">Danh sách Rule đang hoạt động</p>
        </div>
        {!isLoading && rows.length === 0 ? (
          <EmptyState icon={Zap} title="Chưa có rule nào" />
        ) : (
          <ul className="divide-y divide-gray-100 dark:divide-slate-700">
            {rows.map(({ rule, homeName }) => (
              <li key={rule.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-slate-100">{rule.name}</p>
                  <p className="text-xs text-gray-400 dark:text-slate-500">{homeName}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => toggle(rule.id)}
                    className={`rounded px-2.5 py-1 text-xs font-semibold transition ${rule.enabled ? "bg-success-soft text-success" : "bg-gray-100 dark:bg-slate-700 text-gray-500 dark:text-slate-400"}`}
                  >
                    {rule.enabled ? "Bật" : "Tắt"}
                  </button>
                  <button type="button" onClick={() => setDeleteTarget(rule.id)}
                    className="inline-flex items-center gap-1 rounded border border-critical/20 bg-critical-soft px-2.5 py-1 text-xs font-medium text-critical transition hover:brightness-95">
                    <Trash2 className="h-3 w-3" /> Xoá
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Xoá Rule"
        description="Xoá rule tự động hoá này? Hành động không thể hoàn tác."
        confirmLabel="Xoá"
        danger
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
