"use client";

import { useState } from "react";
import { Check, Plus, Sparkles, Trash2, X, Zap } from "lucide-react";
import ConfirmDialog from "@smarthome/shared/ui/ConfirmDialog";
import EmptyState from "@smarthome/shared/ui/EmptyState";
import Skeleton from "@smarthome/shared/ui/Skeleton";
import Switch from "@smarthome/shared/ui/Switch";
import { useToast } from "@smarthome/shared/ui/Toast";
import {
  deleteAutomation, getHomeOverview, listAutomation, listSuggestions, respondSuggestion, toggleAutomation,
  type HomeOverview,
} from "@smarthome/shared/mock/portal";
import type { AutomationRule, HabitSuggestion } from "@smarthome/shared/mock/types";
import HomeGate from "@/features/home/components/HomeGate";
import { useCurrentHome } from "@/features/home/providers/CurrentHomeProvider";
import CreateRuleDialog from "@/features/automation/components/CreateRuleDialog";
import { useHomeQuery, useRevalidatePortal } from "@/lib/portal-swr";
import { portalErrorMessage } from "@/lib/errors";

const METRIC_LABELS: Record<AutomationRule["trigger_metric"], { label: string; unit: string }> = {
  temperature: { label: "nhiệt độ", unit: "°C" },
  humidity: { label: "độ ẩm", unit: "%" },
  power_usage: { label: "công suất", unit: " W" },
};

function describeRule(rule: AutomationRule, overview: HomeOverview | undefined) {
  const room = overview?.rooms.find((r) => r.id === rule.trigger_room_id)?.name ?? `phòng #${rule.trigger_room_id}`;
  const device = overview?.devices.find((d) => d.id === rule.action_device_id)?.device_name ?? `thiết bị #${rule.action_device_id}`;
  const metric = METRIC_LABELS[rule.trigger_metric];
  return {
    when: `${room}: ${metric.label} ${rule.trigger_operator} ${rule.trigger_threshold}${metric.unit}`,
    then: `${rule.action_command === "turn_on" ? "Bật" : "Tắt"} ${device}`,
  };
}

function describeSuggestion(s: HabitSuggestion, overview: HomeOverview | undefined) {
  const device = overview?.devices.find((d) => d.id === s.device_id);
  const name = device ? `${device.device_name} (${device.room_name})` : `thiết bị #${s.device_id}`;
  return `Bạn thường ${s.action === "turn_on" ? "bật" : "tắt"} ${name} lúc ${s.time_of_day} — ${s.days_matched}/${s.window_days} ngày gần nhất.`;
}

function Automation() {
  const { customerId, permissions } = useCurrentHome();
  const { showToast } = useToast();
  const revalidate = useRevalidatePortal();
  const { data: rules, isLoading } = useHomeQuery("automation", listAutomation);
  const { data: suggestions } = useHomeQuery("suggestions", listSuggestions);
  const { data: overview } = useHomeQuery("overview", getHomeOverview);
  const [creating, setCreating] = useState(false);
  const [toDelete, setToDelete] = useState<AutomationRule | null>(null);

  const canManage = !!permissions?.canManageAutomation;
  const pending = suggestions?.filter((s) => s.status === "pending") ?? [];
  const accepted = suggestions?.filter((s) => s.status === "accepted") ?? [];

  async function run(action: () => Promise<unknown>, success: string) {
    try {
      await action();
      await revalidate();
      showToast(success);
    } catch (err) {
      showToast(portalErrorMessage(err), false);
    }
  }

  return (
    <div className="w-full space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-gray-900 dark:text-slate-100">Tự động hoá</h1>
          <p className="mt-0.5 text-sm text-gray-500 dark:text-slate-400">
            {canManage ? "Tạo quy tắc NẾU … THÌ … và duyệt gợi ý từ thói quen sử dụng." : "Vai trò của bạn chỉ được xem các quy tắc tự động hoá."}
          </p>
        </div>
        {canManage && (
          <button
            type="button" onClick={() => setCreating(true)}
            className="inline-flex items-center gap-1.5 rounded bg-brand px-3.5 py-1.5 text-sm font-semibold text-white transition hover:brightness-90"
          >
            <Plus className="h-4 w-4" /> Tạo quy tắc
          </button>
        )}
      </div>

      {/* Gợi ý thói quen — chỉ hiện nút khi có quyền; chấp nhận mới được thực thi. */}
      <section className="rounded-md border border-[#E5EAF0] dark:border-slate-700 bg-white dark:bg-slate-800">
        <div className="flex items-center gap-2 border-b border-gray-100 dark:border-slate-700 px-4 py-3">
          <Sparkles className="h-4 w-4 text-brand" />
          <h2 className="text-sm font-semibold text-gray-900 dark:text-slate-100">Gợi ý từ thói quen</h2>
        </div>
        {pending.length === 0 ? (
          <p className="px-4 py-4 text-sm text-gray-500 dark:text-slate-400">Chưa có gợi ý mới. Hệ thống sẽ đề xuất khi một thao tác lặp lại đều đặn.</p>
        ) : (
          <ul className="divide-y divide-gray-100 dark:divide-slate-700">
            {pending.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <p className="min-w-60 flex-1 text-sm text-gray-700 dark:text-slate-300">{describeSuggestion(s, overview)}</p>
                {canManage && (
                  <div className="flex gap-2">
                    <button
                      type="button" onClick={() => run(() => respondSuggestion(customerId, s.id, true), "Đã tạo lịch tự động từ gợi ý.")}
                      className="inline-flex items-center gap-1 rounded bg-brand px-3 py-1.5 text-xs font-semibold text-white transition hover:brightness-90"
                    >
                      <Check className="h-3.5 w-3.5" /> Chấp nhận
                    </button>
                    <button
                      type="button" onClick={() => run(() => respondSuggestion(customerId, s.id, false), "Đã bỏ qua. Gợi ý này sẽ không lặp lại trong 30 ngày.")}
                      className="inline-flex items-center gap-1 rounded border border-gray-200 dark:border-slate-600 px-3 py-1.5 text-xs font-semibold text-gray-600 dark:text-slate-300 transition hover:bg-gray-50 dark:hover:bg-slate-700"
                    >
                      <X className="h-3.5 w-3.5" /> Bỏ qua
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
        {accepted.length > 0 && (
          <div className="border-t border-gray-100 dark:border-slate-700 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-slate-500">Lịch đã chấp nhận</p>
            <ul className="mt-1.5 space-y-1">
              {accepted.map((s) => (
                <li key={s.id} className="text-sm text-gray-600 dark:text-slate-300">• {describeSuggestion(s, overview)}</li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section className="rounded-md border border-[#E5EAF0] dark:border-slate-700 bg-white dark:bg-slate-800">
        <div className="flex items-center gap-2 border-b border-gray-100 dark:border-slate-700 px-4 py-3">
          <Zap className="h-4 w-4 text-warning" />
          <h2 className="text-sm font-semibold text-gray-900 dark:text-slate-100">Quy tắc</h2>
        </div>
        {isLoading ? (
          <div className="space-y-2 p-4"><Skeleton className="h-10" /><Skeleton className="h-10" /></div>
        ) : !rules || rules.length === 0 ? (
          <EmptyState icon={Zap} title="Chưa có quy tắc nào" description={canManage ? "Bấm “Tạo quy tắc” để bắt đầu." : undefined} />
        ) : (
          <ul className="divide-y divide-gray-100 dark:divide-slate-700">
            {rules.map((rule) => {
              const text = describeRule(rule, overview);
              return (
                <li key={rule.id} className="flex flex-wrap items-center gap-4 px-4 py-3">
                  <div className="min-w-60 flex-1">
                    <p className="text-sm font-semibold text-gray-900 dark:text-slate-100">{rule.name}</p>
                    <p className="mt-0.5 text-xs text-gray-500 dark:text-slate-400">
                      <span className="font-semibold text-gray-600 dark:text-slate-300">NẾU</span> {text.when}
                      <span className="mx-1.5 font-semibold text-gray-600 dark:text-slate-300">THÌ</span> {text.then}
                    </p>
                  </div>
                  <Switch
                    checked={rule.enabled} disabled={!canManage} label={`${rule.enabled ? "Tắt" : "Bật"} quy tắc ${rule.name}`}
                    onChange={() => run(() => toggleAutomation(customerId, rule.id), rule.enabled ? "Đã tạm dừng quy tắc." : "Đã bật quy tắc.")}
                  />
                  {permissions?.canDeleteAutomation && (
                    <button
                      type="button" onClick={() => setToDelete(rule)} aria-label={`Xoá quy tắc ${rule.name}`}
                      className="rounded p-1.5 text-gray-400 transition hover:bg-critical-soft hover:text-critical"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {creating && overview && (
        <CreateRuleDialog
          overview={overview}
          onClose={() => setCreating(false)}
          onCreated={async () => { setCreating(false); await revalidate(); showToast("Đã tạo quy tắc mới."); }}
        />
      )}

      <ConfirmDialog
        open={!!toDelete}
        title="Xoá quy tắc"
        description={`Xoá vĩnh viễn quy tắc “${toDelete?.name ?? ""}”?`}
        confirmLabel="Xoá"
        cancelLabel="Huỷ"
        danger
        onConfirm={() => {
          const rule = toDelete;
          setToDelete(null);
          if (rule) run(() => deleteAutomation(customerId, rule.id), "Đã xoá quy tắc.");
        }}
        onCancel={() => setToDelete(null)}
      />
    </div>
  );
}

export default function AutomationPage() {
  return <HomeGate>{() => <Automation />}</HomeGate>;
}
