"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useCustomerDetail } from "@smarthome/console/customers/hooks/useCustomerDetail";
import Panel, { PanelEmpty } from "@smarthome/console/components/Panel";
import { LoadErrorBar, PageError, PageLoading } from "@smarthome/console/components/PageStates";
import StatusBadge from "@smarthome/shared/ui/StatusBadge";
import { parseRouteId } from "@smarthome/console/lib/ids";
import { useNow } from "@smarthome/console/lib/hooks";
import { formatDate, formatDateTime, formatRelative, isPast } from "@smarthome/console/lib/format";
import { ACTIVATION_METHOD_LABELS, ACTIVATION_REASON_LABELS, PACKAGE_LABELS } from "@smarthome/console/lib/labels";

export default function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { detail, isLoading, error, refresh } = useCustomerDetail(parseRouteId(id));
  const now = useNow();

  if (!detail) {
    if (!error || isLoading) return <PageLoading />;
    return (
      <PageError
        error={error}
        backHref="/customers"
        backLabel="Trở về Customers"
        notFoundText="Không tìm thấy khách hàng này."
        onRetry={() => void refresh()}
      />
    );
  }

  const { customer, homes, warranties, activations } = detail;

  return (
    <div className="w-full space-y-3">
      <div>
        <Link href="/customers" className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200">
          <ArrowLeft className="h-3.5 w-3.5" /> Customers
        </Link>
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          <h1 className="text-lg font-semibold text-gray-900 dark:text-slate-100">{customer.name}</h1>
          <span className="rounded bg-brand-soft px-1.5 py-0.5 font-mono text-xs font-semibold text-brand">{customer.user_tag}</span>
          <StatusBadge status={customer.status} />
        </div>
        <p className="mt-0.5 text-sm text-gray-500 dark:text-slate-400">
          {[customer.phone, customer.email].filter(Boolean).join(" · ") || "Chưa có thông tin liên hệ"}
          {" · "}Tham gia: {formatDate(customer.joined_at)}
          {" · "}Đăng nhập gần nhất: {formatRelative(customer.last_login, "chưa đăng nhập")}
        </p>
        {customer.address && <p className="text-sm text-gray-400 dark:text-slate-500">{customer.address}</p>}
      </div>

      {!!error && <LoadErrorBar error={error} onRetry={() => void refresh()} />}

      <div className="grid gap-3 xl:grid-cols-3">
        <Panel title={`Smart Home đã mua (${homes.length})`}>
          {homes.length === 0 ? (
            <PanelEmpty>Chưa sở hữu nhà nào.</PanelEmpty>
          ) : (
            <ul className="divide-y divide-gray-100 dark:divide-slate-700">
              {homes.map((h) => (
                <li key={h.id} className="px-4 py-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <Link href={`/smart-homes/${h.id}`} className="text-sm font-medium text-brand hover:brightness-90">{h.name}</Link>
                    <StatusBadge status={h.status} />
                  </div>
                  <p className="mt-0.5 text-xs text-gray-400 dark:text-slate-500">
                    {h.package} · {h.room_count} phòng · {h.device_count} thiết bị
                    {h.gateway_online !== null && (h.gateway_online ? " · Gateway online" : " · Gateway offline")}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Bảo hành" subtitle="12 tháng kể từ ngày kích hoạt nhà.">
          {warranties.length === 0 ? (
            <PanelEmpty>Không có bảo hành nào.</PanelEmpty>
          ) : (
            <ul className="divide-y divide-gray-100 dark:divide-slate-700">
              {warranties.map((w) => {
                const expired = isPast(w.expires_at, now);
                return (
                  <li key={w.id} className="px-4 py-2.5 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-gray-700 dark:text-slate-300">{PACKAGE_LABELS[w.package]}</span>
                      <StatusBadge status={expired ? "inactive" : "active"} label={expired ? "Hết hạn" : "Còn hiệu lực"} />
                    </div>
                    <p className="mt-0.5 text-xs text-gray-400 dark:text-slate-500">
                      <Link href={`/smart-homes/${w.home_id}`} className="hover:text-brand">{w.home_name}</Link>
                      {" · "}{formatDate(w.starts_at)} → {formatDate(w.expires_at)}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>

        <Panel title="Lịch sử kích hoạt" subtitle="Mọi lượt quét QR / nhập mã / Operator gán.">
          {activations.length === 0 ? (
            <PanelEmpty>Chưa có lượt kích hoạt nào.</PanelEmpty>
          ) : (
            <ul className="divide-y divide-gray-100 dark:divide-slate-700">
              {activations.map((a) => (
                <li key={a.id} className="px-4 py-2.5 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs text-gray-400 dark:text-slate-500">{formatDateTime(a.activated_at)}</span>
                    <StatusBadge status={a.result === "success" ? "active" : "blocked"} label={a.result === "success" ? "Thành công" : "Thất bại"} />
                  </div>
                  <p className="mt-0.5 text-xs text-gray-500 dark:text-slate-400">
                    {a.home_id && a.home_name ? (
                      <Link href={`/smart-homes/${a.home_id}`} className="font-medium hover:text-brand">{a.home_name}</Link>
                    ) : "Mã không gắn với nhà nào"}
                    {" · "}{ACTIVATION_METHOD_LABELS[a.method] ?? "Phương thức khác"}
                  </p>
                  {a.result === "failed" && (
                    <p className="text-xs text-critical">
                      {(a.reason && ACTIVATION_REASON_LABELS[a.reason]) ?? "Không rõ lý do"}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}
