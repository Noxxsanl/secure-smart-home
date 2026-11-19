"use client";

import { useState } from "react";
import { AlarmClock, PauseCircle, Plus } from "lucide-react";
import { ConfirmDialog, EmptyState, ErrorPanel, Skeleton, useToast } from "@shh/ui";
import { errorStatus, portalErrorMessage, useHomeOverview } from "@shh/api-client/portal";
import type { MyHome, Schedule, ScheduleInput, ScheduleScope } from "@shh/api-client/portal";
import { HomeGate, permissionsFor } from "@shh/auth";
import { useNow } from "@shh/utils";
import { useSchedules } from "../../api/portalSchedules.api";
import { useScheduleActions } from "../../api/useScheduleActions";
import CreateScheduleDialog from "../../ui/CreateScheduleDialog";
import ScheduleRow from "../../ui/ScheduleRow";
import { SCHEDULE_ERRORS, formatRunAt, schedulableDevices } from "../../model/scheduledAction";

const TABS: { value: ScheduleScope; label: string }[] = [
  { value: "upcoming", label: "Sắp chạy" },
  { value: "history", label: "Đã chạy" },
];

function Schedules({ myHome }: { myHome: MyHome }) {
  const homeId = myHome.home.id;
  const perms = permissionsFor(myHome.role);
  const { showToast } = useToast();
  const actions = useScheduleActions(homeId);
  const nowMs = useNow(15_000);

  const [tab, setTab] = useState<ScheduleScope>("upcoming");
  const [creating, setCreating] = useState(false);
  const [toCancel, setToCancel] = useState<Schedule | null>(null);
  const [busy, setBusy] = useState(false);

  const query = useSchedules(homeId, tab);
  // Danh sách thiết bị của hộp thoại tạo lịch — dùng chung cache với Tổng quan, không polling riêng.
  const { data: overview } = useHomeOverview(homeId, 0);
  const devices = overview ? schedulableDevices(overview.devices) : [];
  const suspended = (overview?.home.status ?? myHome.home.status) === "suspended";
  const timezone = overview?.home.timezone ?? myHome.home.timezone;
  const items = query.data?.items;

  async function create(input: ScheduleInput) {
    await actions.create(input);
    setCreating(false);
    setTab("upcoming");
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
      // 404 / 409: lịch vừa chạy hoặc đã bị huỷ — danh sách đã cũ, tải lại cho khớp.
      const status = errorStatus(err);
      if (status === 404 || status === 409) await actions.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="w-full space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-gray-900 dark:text-slate-100">Hẹn giờ</h1>
          <p className="mt-0.5 text-sm text-gray-500 dark:text-slate-400">
            {perms.mayControl
              ? "Hẹn bật/tắt đèn, quạt, rèm, điều hoà một lần vào giờ đã chọn (tối đa 7 ngày tới). Khác với tự động hoá lặp lại hằng tuần."
              : "Vai trò của bạn chỉ được xem các hẹn giờ của nhà."}
          </p>
        </div>
        {perms.mayControl && (
          <button
            type="button" onClick={() => setCreating(true)} disabled={suspended || !overview}
            className="inline-flex items-center gap-1.5 rounded bg-brand px-3.5 py-1.5 text-sm font-semibold text-white transition hover:brightness-90 disabled:opacity-50"
          >
            <Plus className="h-4 w-4" /> Thêm hẹn giờ
          </button>
        )}
      </div>

      {suspended && (
        <p role="status" className="flex items-start gap-2 rounded-md border border-critical/30 bg-critical-soft px-4 py-3 text-sm text-critical">
          <PauseCircle className="mt-0.5 h-4 w-4 shrink-0" />
          Dịch vụ của nhà này đang tạm ngưng nên chưa tạo được hẹn giờ mới. Bạn vẫn huỷ được các lịch đang chờ.
        </p>
      )}

      <div className="flex gap-1.5" role="tablist" aria-label="Loại hẹn giờ">
        {TABS.map(({ value, label }) => (
          <button
            key={value} type="button" role="tab" aria-selected={tab === value} onClick={() => setTab(value)}
            className={`rounded px-3 py-1.5 text-xs font-semibold transition ${
              tab === value ? "bg-brand text-white" : "bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-slate-400 hover:bg-gray-200 dark:hover:bg-slate-600"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <section className="overflow-hidden rounded-md border border-[#E5EAF0] dark:border-slate-700 bg-white dark:bg-slate-800">
        {!items ? (
          query.error ? (
            <div className="p-4"><ErrorPanel error={query.error} onRetry={() => query.mutate()} /></div>
          ) : (
            <div className="space-y-2 p-4"><Skeleton className="h-12" /><Skeleton className="h-12" /></div>
          )
        ) : items.length === 0 ? (
          <EmptyState
            icon={AlarmClock}
            title={tab === "upcoming" ? "Chưa có hẹn giờ nào đang chờ" : "Chưa có hẹn giờ nào đã chạy"}
            description={tab === "upcoming" && perms.mayControl ? "Bấm “Thêm hẹn giờ” để đặt giờ bật/tắt thiết bị." : undefined}
          />
        ) : (
          <ul className="divide-y divide-gray-100 dark:divide-slate-700">
            {items.map((s) => (
              <ScheduleRow key={s.id} schedule={s} nowMs={nowMs} history={tab === "history"} disabled={busy} onCancel={setToCancel} />
            ))}
          </ul>
        )}
      </section>

      {creating && (
        <CreateScheduleDialog devices={devices} timezone={timezone} onSubmit={create} onClose={() => setCreating(false)} />
      )}

      <ConfirmDialog
        open={!!toCancel}
        title="Huỷ hẹn giờ"
        description={toCancel ? `Huỷ “${toCancel.action_label}” lúc ${formatRunAt(toCancel.run_at, toCancel.timezone, nowMs)}? Thiết bị sẽ không được điều khiển vào giờ đó.` : ""}
        confirmLabel="Huỷ hẹn giờ"
        cancelLabel="Giữ lại"
        danger
        onConfirm={() => void confirmCancel()}
        onCancel={() => setToCancel(null)}
      />
    </div>
  );
}

export default function SchedulesPage() {
  return <HomeGate>{(home) => <Schedules myHome={home} />}</HomeGate>;
}
