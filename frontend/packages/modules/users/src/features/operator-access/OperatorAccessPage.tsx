"use client";

import { useState } from "react";
import Link from "next/link";
import { KeyRound, Plus, Ban, RefreshCw } from "lucide-react";
import { useOperatorAccess } from "../../api/useOperatorAccess";
import { useTeam } from "../../api/useTeam";
import { useHomeOptions, errorMessage } from "@shh/api-client/dashboard";
import { usePermissions } from "@shh/auth";
import {
  ConfirmModal, InlineError, LoadErrorBar, useToast, StatusBadge, EmptyState, BTN_PRIMARY, BTN_SM_DANGER, CARD, CARD_HEADER, INPUT, LABEL, SEGMENTED, SELECT, segmentButton,
} from "@shh/ui";
import { useNow, formatDateTime, formatRemaining } from "@shh/utils";
import type { OperatorAccessGrant } from "@shh/api-client/dashboard";

const DURATIONS = [
  { label: "1 giờ", hours: 1 },
  { label: "2 giờ", hours: 2 },
  { label: "4 giờ", hours: 4 },
  { label: "8 giờ", hours: 8 },
  { label: "24 giờ", hours: 24 },
  { label: "2 ngày", hours: 48 },
  { label: "3 ngày", hours: 72 },
];

const REASON_MIN = 5;
const REASON_MAX = 255;

type Filter = "active" | "all";

function grantStatus(g: OperatorAccessGrant): { kind: string; label: string } {
  if (g.revoked_at) return { kind: "blocked", label: "Đã thu hồi" };
  if (g.active) return { kind: "active", label: "Đang hiệu lực" };
  return { kind: "inactive", label: "Đã hết hạn" };
}

export default function OperatorAccessPage() {
  const { canGrantAccess } = usePermissions();
  const { showToast } = useToast();
  const now = useNow();
  const { grants, isLoading, isValidating, error, refresh, grant, revoke } = useOperatorAccess();
  const { members } = useTeam();
  const { homes } = useHomeOptions();

  const operators = members.filter((m) => m.role === "operator" && m.status === "active");

  const [operatorId, setOperatorId] = useState<number | null>(null);
  const [homeId, setHomeId] = useState<number | null>(null);
  const [durationHours, setDurationHours] = useState(DURATIONS[1].hours);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [filter, setFilter] = useState<Filter>("active");
  const [revokeTarget, setRevokeTarget] = useState<OperatorAccessGrant | null>(null);

  const visible = filter === "active" ? grants.filter((g) => g.active && !g.revoked_at) : grants;
  const activeCount = grants.filter((g) => g.active && !g.revoked_at).length;

  async function handleGrant() {
    const trimmed = reason.trim();
    if (operatorId === null || homeId === null) {
      setFormError("Chọn Operator và Smart Home cần cấp quyền.");
      return;
    }
    if (trimmed.length < REASON_MIN || trimmed.length > REASON_MAX) {
      setFormError(`Nhập lý do từ ${REASON_MIN} đến ${REASON_MAX} ký tự (VD: số ticket, mô tả sự cố).`);
      return;
    }
    setSubmitting(true);
    setFormError("");
    try {
      const created = await grant({ operator_id: operatorId, home_id: homeId, reason: trimmed, duration_hours: durationHours });
      setReason("");
      showToast(`Đã cấp quyền cho ${created.operator_username} trên “${created.home_name}”.`);
    } catch (err) {
      setFormError(errorMessage(err, {
        INVALID_INPUT: `Kiểm tra lại: lý do ${REASON_MIN}–${REASON_MAX} ký tự, thời hạn 1–72 giờ, Operator và nhà phải còn tồn tại.`,
        NOT_FOUND: "Không tìm thấy Operator hoặc Smart Home đã chọn — có thể vừa bị xoá. Tải lại trang rồi thử lại.",
      }));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="w-full space-y-3">
      <div>
        <h1 className="text-lg font-semibold text-gray-900 dark:text-slate-100">Operator Access</h1>
        <p className="mt-0.5 text-sm text-gray-500 dark:text-slate-400">
          Cấp quyền hỗ trợ có thời hạn cho Operator trên một Smart Home đã kích hoạt (FR-9.6). Operator cũng tự xin được quyền
          khẩn cấp ở trang Smart Home — mọi truy cập đều được ghi log và bạn nhận thông báo.
        </p>
      </div>

      {canGrantAccess && (
        <div className={`${CARD} p-4`}>
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-gray-400 dark:text-slate-500">Cấp quyền mới</p>
          <form
            noValidate
            onSubmit={(e) => { e.preventDefault(); if (!submitting) void handleGrant(); }}
            className="space-y-3"
          >
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <label htmlFor="grant-operator" className={LABEL}>Operator</label>
                <select
                  id="grant-operator" value={operatorId ?? ""} disabled={submitting}
                  onChange={(e) => { setOperatorId(e.target.value ? Number(e.target.value) : null); setFormError(""); }}
                  className={`${SELECT} w-full`}
                >
                  <option value="">— Chọn Operator —</option>
                  {operators.map((o) => <option key={o.id} value={o.id}>{o.username}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="grant-home" className={LABEL}>Smart Home</label>
                <select
                  id="grant-home" value={homeId ?? ""} disabled={submitting}
                  onChange={(e) => { setHomeId(e.target.value ? Number(e.target.value) : null); setFormError(""); }}
                  className={`${SELECT} w-full`}
                >
                  <option value="">— Chọn Smart Home —</option>
                  {homes.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="grant-duration" className={LABEL}>Thời hạn</label>
                <select
                  id="grant-duration" value={durationHours} disabled={submitting}
                  onChange={(e) => setDurationHours(Number(e.target.value))}
                  className={`${SELECT} w-full`}
                >
                  {DURATIONS.map((d) => <option key={d.hours} value={d.hours}>{d.label}</option>)}
                </select>
              </div>
              <div className="flex items-end">
                <button type="submit" disabled={submitting} className={`${BTN_PRIMARY} h-9 w-full`}>
                  {submitting ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                  Cấp quyền
                </button>
              </div>
            </div>
            <div>
              <label htmlFor="grant-reason" className={LABEL}>Lý do (bắt buộc)</label>
              <input
                id="grant-reason" type="text" value={reason} maxLength={REASON_MAX} disabled={submitting}
                onChange={(e) => { setReason(e.target.value); setFormError(""); }}
                placeholder="VD: Ticket #1024 — gateway mất kết nối, cần kiểm tra RSSI"
                className={INPUT}
              />
            </div>
            <InlineError>{formError}</InlineError>
          </form>
        </div>
      )}

      <div className={`overflow-hidden ${CARD}`}>
        <div className={CARD_HEADER}>
          <div>
            <p className="text-sm font-semibold text-gray-900 dark:text-slate-100">Danh sách quyền truy cập</p>
            <p className="mt-0.5 text-xs text-gray-500 dark:text-slate-400">
              {isLoading || (isValidating && grants.length === 0) ? "Đang tải…" : `${activeCount} đang hiệu lực · ${grants.length} tổng cộng`}
            </p>
          </div>
          <div className={SEGMENTED}>
            <button type="button" onClick={() => setFilter("active")} className={segmentButton(filter === "active")}>Đang hiệu lực</button>
            <button type="button" onClick={() => setFilter("all")} className={segmentButton(filter === "all")}>Tất cả</button>
          </div>
        </div>

        {!!error && <LoadErrorBar error={error} onRetry={() => void refresh()} />}

        {!isLoading && visible.length === 0 ? (
          <EmptyState
            icon={KeyRound}
            title={filter === "active" ? "Không có quyền nào đang hiệu lực" : "Chưa có quyền truy cập nào được cấp"}
            description={filter === "active" ? "Chuyển sang “Tất cả” để xem quyền đã hết hạn hoặc đã thu hồi." : undefined}
          />
        ) : (
          <ul className="divide-y divide-gray-100 dark:divide-slate-700">
            {visible.map((g) => {
              const status = grantStatus(g);
              const remaining = g.active && !g.revoked_at ? formatRemaining(g.expires_at, now) : null;
              return (
                <li key={g.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-slate-100">
                      {g.operator_username} →{" "}
                      <Link href={`/smart-homes/${g.home_id}`} className="text-brand hover:brightness-90">{g.home_name}</Link>
                    </p>
                    <p className="mt-0.5 text-xs text-gray-500 dark:text-slate-400">Lý do: {g.reason}</p>
                    <p className="mt-0.5 text-xs text-gray-400 dark:text-slate-500">
                      Cấp lúc {formatDateTime(g.granted_at)}
                      {g.granted_by_username ? ` bởi ${g.granted_by_username}` : ""}
                      {" · "}Hết hạn {formatDateTime(g.expires_at)}
                      {remaining ? ` (còn ${remaining})` : ""}
                      {g.revoked_at ? ` · Thu hồi lúc ${formatDateTime(g.revoked_at)}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={status.kind} label={status.label} />
                    {g.active && !g.revoked_at && (
                      <button type="button" onClick={() => setRevokeTarget(g)} className={BTN_SM_DANGER}>
                        <Ban className="h-3 w-3" /> Thu hồi
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {revokeTarget && (
        <ConfirmModal
          title="Thu hồi quyền truy cập"
          subtitle={`${revokeTarget.operator_username} → ${revokeTarget.home_name}`}
          icon={Ban}
          danger
          description="Operator sẽ mất quyền xem dữ liệu khách hàng của Smart Home này ngay lập tức."
          confirmLabel="Thu hồi"
          onConfirm={async () => {
            await revoke(revokeTarget.id);
            showToast("Đã thu hồi quyền truy cập.");
          }}
          onClose={() => setRevokeTarget(null)}
        />
      )}
    </div>
  );
}
