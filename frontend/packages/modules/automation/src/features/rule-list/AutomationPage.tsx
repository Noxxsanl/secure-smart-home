"use client";

import { useState } from "react";
import Link from "next/link";
import { Zap, RefreshCw, Search, Info } from "lucide-react";
import { useAutomation } from "../../api/useAutomation";
import { useHomeOptions, errorMessage, describeAction, describeTrigger } from "@shh/api-client/dashboard";
import { usePermissions } from "@shh/auth";
import {
  LoadErrorBar, EmptyState, StatusBadge, Switch, useToast, CARD, MUTED_DASH, SEARCH_INPUT, SELECT_SM, TABLE_HEAD_ROW, TH, TOOLBAR, TR,
} from "@shh/ui";
import { formatDateTime, formatRelative } from "@shh/utils";
import type { AutomationRule } from "@shh/api-client/dashboard";

export default function AutomationPage() {
  const { canToggleAutomation, isOperator } = usePermissions();
  const { showToast } = useToast();
  const { homes } = useHomeOptions();
  const [homeId, setHomeId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);
  const { rules, isLoading, isValidating, error, refresh, setEnabled } = useAutomation(homeId);

  const needle = search.trim().toLowerCase();
  const filtered = needle
    ? rules.filter((r) => r.name.toLowerCase().includes(needle) || r.home_name.toLowerCase().includes(needle))
    : rules;

  async function handleToggle(rule: AutomationRule) {
    if (busyId !== null) return;
    setBusyId(rule.id);
    try {
      const next = !rule.enabled;
      await setEnabled(rule, next);
      showToast(next ? `Đã bật rule “${rule.name}”.` : `Đã tắt rule “${rule.name}”.`);
    } catch (err) {
      showToast(errorMessage(err, {
        HOME_SUSPENDED: "Nhà đang tạm ngưng nên chưa đổi được rule. Kích hoạt lại nhà trước.",
      }), false);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="w-full space-y-3">
      <div>
        <h1 className="text-lg font-semibold text-gray-900 dark:text-slate-100">Automation Rules</h1>
        <p className="mt-0.5 text-sm text-gray-500 dark:text-slate-400">
          Rule tự động hoá của khách hàng trên các Smart Home. Rule do khách tạo và sửa trên ứng dụng — nhân viên chỉ xem
          {canToggleAutomation ? "; Admin có thể bật/tắt khi cần xử lý sự cố." : "."}
        </p>
      </div>

      {isOperator && (
        <p className="flex items-start gap-2 rounded border border-brand/20 bg-brand-soft/40 px-3 py-2 text-xs text-gray-600 dark:text-slate-300">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand" />
          Operator chỉ thấy rule của nhà chưa kích hoạt và nhà đang có quyền truy cập còn hiệu lực. Xin quyền ở trang Smart Home của nhà.
        </p>
      )}

      <div className={`overflow-hidden ${CARD}`}>
        <div className={TOOLBAR}>
          <select
            aria-label="Lọc theo Smart Home"
            value={homeId ?? ""}
            onChange={(e) => setHomeId(e.target.value ? Number(e.target.value) : null)}
            className={SELECT_SM}
          >
            <option value="">Mọi Smart Home</option>
            {homes.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
          </select>
          <div className="relative min-w-48 max-w-72 flex-1">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400 dark:text-slate-500" />
            <input
              type="text"
              placeholder="Tìm theo tên rule hoặc nhà…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className={SEARCH_INPUT}
            />
          </div>
          <span className="ml-auto flex items-center gap-2 text-xs text-gray-400 dark:text-slate-500">
            {isLoading || (isValidating && rules.length === 0)
              ? <><RefreshCw className="h-3.5 w-3.5 animate-spin" /> Đang tải…</>
              : <span><span className="font-semibold text-gray-700 dark:text-slate-300">{filtered.length}</span> rule</span>}
          </span>
        </div>

        {!!error && <LoadErrorBar error={error} onRetry={() => void refresh()} />}

        {!isLoading && filtered.length === 0 ? (
          <EmptyState
            icon={Zap}
            title={rules.length === 0 ? "Chưa có rule nào" : "Không tìm thấy rule phù hợp"}
            description={rules.length === 0 ? "Rule xuất hiện ở đây khi khách hàng tạo tự động hoá trên ứng dụng." : "Thử đổi bộ lọc hoặc từ khoá."}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full table-auto text-left text-sm">
              <thead>
                <tr className={TABLE_HEAD_ROW}>
                  <th className={TH}>Rule</th>
                  <th className={TH}>Smart Home</th>
                  <th className={TH}>Điều kiện</th>
                  <th className={TH}>Hành động</th>
                  <th className={TH}>Chạy gần nhất</th>
                  <th className={TH}>Trạng thái</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                {filtered.map((rule) => (
                  <tr key={rule.id} className={TR}>
                    <td className="px-4 py-3">
                      <p className="flex flex-wrap items-center gap-2 font-medium text-gray-900 dark:text-slate-100">
                        {rule.name}
                        {rule.origin === "ai_suggested" && (
                          <span title="Rule tạo từ gợi ý AI mà khách đã chấp nhận" className="rounded bg-brand-soft px-1.5 py-0.5 text-[10px] font-semibold text-brand">Gợi ý AI</span>
                        )}
                      </p>
                      <p className="text-xs text-gray-400 dark:text-slate-500">
                        {rule.created_by_name ? `Tạo bởi ${rule.created_by_name}` : "Không rõ người tạo"} · {formatDateTime(rule.created_at)}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <Link href={`/smart-homes/${rule.home_id}`} className="text-brand hover:brightness-90">{rule.home_name}</Link>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 dark:text-slate-300">{describeTrigger(rule)}</td>
                    <td className="px-4 py-3 text-sm text-gray-600 dark:text-slate-300">{describeAction(rule)}</td>
                    <td className="px-4 py-3 text-xs text-gray-500 dark:text-slate-400">
                      {rule.last_triggered_at
                        ? <span title={formatDateTime(rule.last_triggered_at)}>{formatRelative(rule.last_triggered_at)}</span>
                        : <span className={MUTED_DASH}>chưa chạy</span>}
                    </td>
                    <td className="px-4 py-3">
                      {canToggleAutomation && rule.can_edit ? (
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={rule.enabled}
                            onChange={() => void handleToggle(rule)}
                            disabled={busyId !== null}
                            label={`${rule.enabled ? "Tắt" : "Bật"} rule ${rule.name}`}
                          />
                          <span className="text-xs text-gray-500 dark:text-slate-400">{rule.enabled ? "Bật" : "Tắt"}</span>
                        </div>
                      ) : (
                        <StatusBadge status={rule.enabled ? "active" : "inactive"} label={rule.enabled ? "Bật" : "Tắt"} />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
