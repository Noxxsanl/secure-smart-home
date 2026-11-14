"use client";

import { useState } from "react";
import { AlarmClock, Plus } from "lucide-react";
import { ConfirmDialog, ErrorPanel, Skeleton, useToast } from "@shh/ui";
import { errorStatus, portalErrorMessage } from "@shh/api-client/portal";
import type { DeviceAppliance, Schedule, ScheduleInput } from "@shh/api-client/portal";
import { useCurrentHome } from "@shh/auth";
import { useNow } from "@shh/utils";
import { useSchedules } from "../../api/portalSchedules.api";
import { useScheduleActions } from "../../api/useScheduleActions";
import CreateScheduleDialog from "../../ui/CreateScheduleDialog";
import ScheduleRow from "../../ui/ScheduleRow";
import { SCHEDULE_APPLIANCES, SCHEDULE_ERRORS, formatRunAt } from "../../model/scheduledAction";

export type DeviceScheduleProps = {
  deviceId: number;
  deviceName: string;
  /** Đồ vật backend đã gán cho relay; null / ngoài đèn-quạt-rèm-điều hoà thì không hiện mục này. */
  appliance: DeviceAppliance | null;
};

// Mục "Hẹn giờ" ở trang chi tiết thiết bị của khách: lịch sắp chạy của riêng thiết bị này + nút thêm hẹn giờ.
// Ghép vào `HomeDeviceDetailPage` của @shh/devices qua slot `renderSchedule` (trang app nối hai module).
export default function DeviceSchedule({ deviceId, deviceName, appliance }: DeviceScheduleProps) {
  const { current } = useCurrentHome();
  const homeId = current?.home.id ?? null;
  const { showToast } = useToast();
  const nowMs = useNow(15_000);
  const supported = appliance !== null && SCHEDULE_APPLIANCES.includes(appliance);
  // Dùng đúng khoá "sắp chạy" của trang Hẹn giờ → một lần tải, hai nơi hiển thị.
  const query = useSchedules(supported ? homeId : null, "upcoming");
  const actions = useScheduleActions(homeId ?? 0);

  const [creating, setCreating] = useState(false);
  const [toCancel, setToCancel] = useState<Schedule | null>(null);
  const [busy, setBusy] = useState(false);

  if (!current || !supported || !appliance) return null;

  const suspended = current.home.status === "suspended";
  const items = query.data?.items.filter((s) => s.device_id === deviceId);

  async function create(input: ScheduleInput) {
    await actions.create(input);
    setCreating(false);
    showToast("Đã tạo hẹn giờ.");
  }

  async function confirmCancel() {
    const schedule = toCancel;
    setToCancel(null);
    if (!schedule) return;
    setBusy(true);
    try {
      await actions.cancel(schedule.id);
      showToast("Đã huỷ hẹn giờ.");
    } catch (err) {
      showToast(portalErrorMessage(err, SCHEDULE_ERRORS), false);
      const status = errorStatus(err);
      if (status === 404 || status === 409) await actions.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-md border border-[#E5EAF0] dark:border-slate-700 bg-white dark:bg-slate-800">
      <div className="flex items-center justify-between gap-3 border-b border-gray-100 dark:border-slate-700 px-4 py-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-slate-100">
          <AlarmClock className="h-4 w-4 text-brand" /> Hẹn giờ
        </h2>
        <button
          type="button" onClick={() => setCreating(true)} disabled={suspended}
          title={suspended ? "Dịch vụ của nhà đang tạm ngưng nên chưa tạo được hẹn giờ mới." : undefined}
          className="inline-flex items-center gap-1 rounded bg-brand px-3 py-1.5 text-xs font-semibold text-white transition hover:brightness-90 disabled:opacity-50"
        >
          <Plus className="h-3.5 w-3.5" /> Thêm hẹn giờ
        </button>
      </div>

      {!items ? (
        query.error ? (
          <div className="p-4"><ErrorPanel error={query.error} onRetry={() => query.mutate()} /></div>
        ) : (
          <div className="p-4"><Skeleton className="h-10" /></div>
        )
      ) : items.length === 0 ? (
        <p className="px-4 py-4 text-sm text-gray-500 dark:text-slate-400">
          Chưa có hẹn giờ nào cho thiết bị này. Bấm “Thêm hẹn giờ” để đặt giờ bật/tắt một lần.
        </p>
      ) : (
        <ul className="divide-y divide-gray-100 dark:divide-slate-700">
          {items.map((s) => (
            <ScheduleRow key={s.id} schedule={s} nowMs={nowMs} compact disabled={busy} onCancel={setToCancel} />
          ))}
        </ul>
      )}

      {creating && (
        <CreateScheduleDialog
          devices={[{ id: deviceId, name: deviceName, roomName: null, appliance }]}
          timezone={current.home.timezone}
          defaultDeviceId={deviceId}
          onSubmit={create}
          onClose={() => setCreating(false)}
        />
      )}

      <ConfirmDialog
        open={!!toCancel}
        title="Huỷ hẹn giờ"
        description={toCancel ? `Huỷ “${toCancel.action_label}” lúc ${formatRunAt(toCancel.run_at, toCancel.timezone, nowMs)}?` : ""}
        confirmLabel="Huỷ hẹn giờ"
        cancelLabel="Giữ lại"
        danger
        onConfirm={() => void confirmCancel()}
        onCancel={() => setToCancel(null)}
      />
    </section>
  );
}
