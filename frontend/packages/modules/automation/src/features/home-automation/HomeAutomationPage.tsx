"use client";

import { useState } from "react";
import { Check, ChevronDown, History, Lock, PauseCircle, Plus, Sparkles, Trash2, X, Zap } from "lucide-react";
import { ConfirmDialog, EmptyState, Skeleton, Switch, useToast, ErrorPanel } from "@shh/ui";
import {
  errorStatus, useRevalidate, overviewKey, notificationsPrefix, useHomeOverview, isForbidden, portalErrorMessage,
} from "@shh/api-client/portal";
import {
  acceptSuggestion, automationsKey, deleteAutomation, dismissSuggestion, suggestionsKey, updateAutomation,
  useAutomations, useSuggestions,
} from "../../api/portalAutomation.api";
import type { AutomationRule, MyHome } from "@shh/api-client/portal";
import { formatDateTime } from "@shh/utils";
import { permissionsFor, HomeGate } from "@shh/auth";
import CreateRuleDialog from "./CreateRuleDialog";
import RuleHistory from "./RuleHistory";
import { describeRule, describeSuggestion } from "../../model/describe";

// Thông điệp riêng cho các lỗi của luồng tự động hoá (CONTRACT §4.2).
const AUTOMATION_ERRORS: Record<string, string> = {
  FORBIDDEN:
    "Bạn không có quyền thực hiện thao tác này. Chủ nhà làm được mọi thao tác; người điều khiển chỉ sửa, xoá được quy tắc do chính mình tạo.",
  NOT_FOUND: "Quy tắc hoặc gợi ý này không còn tồn tại. Danh sách sẽ được làm mới.",
  INVALID_INPUT: "Quy tắc chưa hợp lệ. Vui lòng kiểm tra lại các trường đã nhập.",
};

function ForbiddenNotice() {
  return (
    <div className="mx-auto mt-10 flex max-w-md flex-col items-center rounded-md border border-[#E5EAF0] bg-white p-8 text-center dark:border-slate-700 dark:bg-slate-800">
      <Lock className="h-8 w-8 text-gray-300 dark:text-slate-600" />
      <h1 className="mt-3 text-base font-semibold text-gray-900 dark:text-slate-100">Vai trò của bạn không xem được tự động hoá</h1>
      <p className="mt-1.5 text-sm text-gray-500 dark:text-slate-400">
        Tự động hoá chỉ dành cho Chủ nhà, Điều khiển và Chỉ xem. Hãy nhờ chủ nhà nâng quyền nếu bạn cần xem hoặc tạo quy tắc.
      </p>
    </div>
  );
}

function Automation({ myHome }: { myHome: MyHome }) {
  const homeId = myHome.home.id;
  const perms = permissionsFor(myHome.role);
  const { showToast } = useToast();
  const revalidate = useRevalidate();

  // GUEST không có quyền xem (403) nên không gọi API; vai trò khác vẫn có thể gặp 403 nếu vừa bị đổi quyền.
  const rulesQuery = useAutomations(perms.canViewAutomation ? homeId : null);
  const suggestionsQuery = useSuggestions(perms.canViewAutomation ? homeId : null);
  // Danh sách phòng / thiết bị cho hộp thoại tạo quy tắc — dùng chung cache với Tổng quan, không polling riêng.
  const { data: overview } = useHomeOverview(homeId, 0);
  const [creating, setCreating] = useState(false);
  const [toDelete, setToDelete] = useState<AutomationRule | null>(null);
  const [historyRuleId, setHistoryRuleId] = useState<number | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  if (!perms.canViewAutomation || isForbidden(rulesQuery.error)) return <ForbiddenNotice />;

  const rules = rulesQuery.data;
  const suggestions = suggestionsQuery.data ?? [];
  const pending = suggestions.filter((s) => s.status === "pending");
  const accepted = suggestions.filter((s) => s.status === "accepted");

  // Nhà tạm ngưng: backend từ chối mọi thao tác ghi (409 HOME_SUSPENDED) nên khoá nút ngay từ đầu.
  const suspended = (overview?.home.status ?? myHome.home.status) === "suspended";
  const canManage = perms.canManageAutomation && !suspended;

  async function refreshAll() {
    await revalidate(automationsKey(homeId), suggestionsKey(homeId), overviewKey(homeId), notificationsPrefix);
  }

  /** Chạy thao tác ghi, báo toast, làm mới dữ liệu; `busyKey` khoá đúng nút đang xử lý. */
  async function run(key: string, action: () => Promise<unknown>, success: string) {
    setBusyKey(key);
    try {
      await action();
      await refreshAll();
      showToast(success);
    } catch (err) {
      showToast(portalErrorMessage(err, AUTOMATION_ERRORS), false);
      // 404 / 409 (đã xử lý, đã xoá) nghĩa là danh sách đã cũ — tải lại cho khớp.
      const status = errorStatus(err);
      if (status === 404 || status === 409) await refreshAll();
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <div className="w-full space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-gray-900 dark:text-slate-100">Tự động hoá</h1>
          <p className="mt-0.5 text-sm text-gray-500 dark:text-slate-400">
            {perms.canManageAutomation
              ? "Tạo quy tắc NẾU … THÌ … hoặc theo lịch, và duyệt gợi ý từ thói quen sử dụng."
              : "Vai trò của bạn chỉ được xem các quy tắc tự động hoá."}
          </p>
        </div>
        {perms.canManageAutomation && (
          <button
            type="button" onClick={() => setCreating(true)} disabled={suspended || !overview}
            className="inline-flex items-center gap-1.5 rounded bg-brand px-3.5 py-1.5 text-sm font-semibold text-white transition hover:brightness-90 disabled:opacity-50"
          >
            <Plus className="h-4 w-4" /> Tạo quy tắc
          </button>
        )}
      </div>

      {suspended && (
        <p role="status" className="flex items-start gap-2 rounded-md border border-critical/30 bg-critical-soft px-4 py-3 text-sm text-critical">
          <PauseCircle className="mt-0.5 h-4 w-4 shrink-0" />
          Dịch vụ của nhà này đang tạm ngưng nên chưa tạo, bật/tắt hay chấp nhận được gợi ý. Bạn vẫn xem được các quy tắc hiện có.
        </p>
      )}

      {/* Gợi ý thói quen (FR-7.4 → 7.6): chỉ là đề xuất, chấp nhận mới tạo quy tắc chạy thật. */}
      <section className="rounded-md border border-[#E5EAF0] dark:border-slate-700 bg-white dark:bg-slate-800">
        <div className="flex items-center gap-2 border-b border-gray-100 dark:border-slate-700 px-4 py-3">
          <Sparkles className="h-4 w-4 text-brand" />
          <h2 className="text-sm font-semibold text-gray-900 dark:text-slate-100">Gợi ý từ thói quen</h2>
        </div>
        <p className="border-b border-gray-100 px-4 py-2 text-xs text-gray-400 dark:border-slate-700 dark:text-slate-500">
          Gợi ý chỉ là đề xuất: thiết bị sẽ không tự bật/tắt cho tới khi bạn chấp nhận.
        </p>
        {suggestionsQuery.error && !suggestionsQuery.data ? (
          <div className="p-4"><ErrorPanel error={suggestionsQuery.error} onRetry={() => suggestionsQuery.mutate()} /></div>
        ) : pending.length === 0 ? (
          <p className="px-4 py-4 text-sm text-gray-500 dark:text-slate-400">
            Chưa có gợi ý mới. Hệ thống sẽ đề xuất khi một thao tác lặp lại đều đặn ít nhất 5 ngày trong tuần.
          </p>
        ) : (
          <ul className="divide-y divide-gray-100 dark:divide-slate-700">
            {pending.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <p className="min-w-60 flex-1 text-sm text-gray-700 dark:text-slate-300">{describeSuggestion(s)}</p>
                {perms.canManageAutomation && (
                  <div className="flex gap-2">
                    <button
                      type="button" disabled={!canManage || busyKey !== null}
                      onClick={() => run(`accept-${s.id}`, () => acceptSuggestion(s.id), "Đã tạo lịch tự động từ gợi ý.")}
                      className="inline-flex items-center gap-1 rounded bg-brand px-3 py-1.5 text-xs font-semibold text-white transition hover:brightness-90 disabled:opacity-50"
                    >
                      <Check className="h-3.5 w-3.5" /> Chấp nhận
                    </button>
                    <button
                      type="button" disabled={!canManage || busyKey !== null}
                      onClick={() => run(`dismiss-${s.id}`, () => dismissSuggestion(s.id), "Đã bỏ qua. Gợi ý này sẽ không lặp lại trong 30 ngày.")}
                      className="inline-flex items-center gap-1 rounded border border-gray-200 dark:border-slate-600 px-3 py-1.5 text-xs font-semibold text-gray-600 dark:text-slate-300 transition hover:bg-gray-50 dark:hover:bg-slate-700 disabled:opacity-50"
                    >
                      <X className="h-3.5 w-3.5" /> Bỏ qua
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
        {!perms.canManageAutomation && pending.length > 0 && (
          <p className="border-t border-gray-100 px-4 py-2 text-xs text-gray-400 dark:border-slate-700 dark:text-slate-500">
            Chỉ chủ nhà hoặc người điều khiển mới chấp nhận / bỏ qua được gợi ý.
          </p>
        )}
        {accepted.length > 0 && (
          <div className="border-t border-gray-100 dark:border-slate-700 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-slate-500">Lịch đã chấp nhận</p>
            <ul className="mt-1.5 space-y-1">
              {accepted.map((s) => (
                <li key={s.id} className="text-sm text-gray-600 dark:text-slate-300">• {describeSuggestion(s)}</li>
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
        {!rules ? (
          rulesQuery.error ? (
            <div className="p-4"><ErrorPanel error={rulesQuery.error} onRetry={() => rulesQuery.mutate()} /></div>
          ) : (
            <div className="space-y-2 p-4"><Skeleton className="h-10" /><Skeleton className="h-10" /></div>
          )
        ) : rules.length === 0 ? (
          <EmptyState icon={Zap} title="Chưa có quy tắc nào" description={perms.canManageAutomation ? "Bấm “Tạo quy tắc” để bắt đầu." : undefined} />
        ) : (
          <ul className="divide-y divide-gray-100 dark:divide-slate-700">
            {rules.map((rule) => {
              const text = describeRule(rule);
              const expanded = historyRuleId === rule.id;
              return (
                <li key={rule.id} className="px-4 py-3">
                  <div className="flex flex-wrap items-center gap-4">
                    <div className="min-w-60 flex-1">
                      <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-gray-900 dark:text-slate-100">
                        {rule.name}
                        {rule.origin === "ai_suggested" && (
                          <span className="inline-flex items-center gap-1 rounded bg-brand-soft px-1.5 py-0.5 text-[10px] font-semibold text-brand">
                            <Sparkles className="h-3 w-3" /> Từ gợi ý
                          </span>
                        )}
                      </p>
                      <p className="mt-0.5 text-xs text-gray-500 dark:text-slate-400">
                        <span className="font-semibold text-gray-600 dark:text-slate-300">{text.prefix}</span> {text.when}
                        <span className="mx-1.5 font-semibold text-gray-600 dark:text-slate-300">THÌ</span> {text.then}
                      </p>
                      <p className="mt-0.5 text-[11px] text-gray-400 dark:text-slate-500">
                        {rule.last_triggered_at ? `Chạy lần cuối ${formatDateTime(rule.last_triggered_at)}` : "Chưa chạy lần nào"}
                        {rule.created_by_name ? ` · Tạo bởi ${rule.created_by_name}` : ""}
                      </p>
                    </div>
                    <button
                      type="button" onClick={() => setHistoryRuleId(expanded ? null : rule.id)} aria-expanded={expanded}
                      className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-semibold text-gray-500 transition hover:bg-gray-100 hover:text-gray-700 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-200"
                    >
                      <History className="h-3.5 w-3.5" /> Lịch sử
                      <ChevronDown className={`h-3.5 w-3.5 transition-transform ${expanded ? "rotate-180" : ""}`} />
                    </button>
                    <span title={rule.can_edit ? undefined : "Bạn không có quyền sửa quy tắc này"}>
                      <Switch
                        checked={rule.enabled}
                        disabled={!rule.can_edit || suspended || busyKey !== null}
                        label={`${rule.enabled ? "Tắt" : "Bật"} quy tắc ${rule.name}`}
                        onChange={() =>
                          run(`toggle-${rule.id}`, () => updateAutomation(rule.id, { enabled: !rule.enabled }),
                            rule.enabled ? "Đã tạm dừng quy tắc." : "Đã bật quy tắc.")}
                      />
                    </span>
                    {rule.can_delete && (
                      <button
                        type="button" onClick={() => setToDelete(rule)} aria-label={`Xoá quy tắc ${rule.name}`} disabled={suspended}
                        className="rounded p-1.5 text-gray-400 transition hover:bg-critical-soft hover:text-critical disabled:opacity-40"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                  {expanded && (
                    <div className="mt-2 rounded bg-gray-50 px-3 py-2 dark:bg-slate-900/50">
                      <RuleHistory ruleId={rule.id} />
                    </div>
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
          onCreated={async () => {
            setCreating(false);
            await refreshAll();
            showToast("Đã tạo quy tắc mới.");
          }}
        />
      )}

      <ConfirmDialog
        open={!!toDelete}
        title="Xoá quy tắc"
        description={`Xoá vĩnh viễn quy tắc “${toDelete?.name ?? ""}”? Quy tắc sẽ ngừng chạy ngay.`}
        confirmLabel="Xoá"
        cancelLabel="Huỷ"
        danger
        onConfirm={() => {
          const rule = toDelete;
          setToDelete(null);
          if (rule) void run(`delete-${rule.id}`, () => deleteAutomation(rule.id), "Đã xoá quy tắc.");
        }}
        onCancel={() => setToDelete(null)}
      />
    </div>
  );
}

export default function AutomationPage() {
  return <HomeGate>{(home) => <Automation myHome={home} />}</HomeGate>;
}
