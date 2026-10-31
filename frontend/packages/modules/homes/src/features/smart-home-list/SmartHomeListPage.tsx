"use client";

import { useState } from "react";
import Link from "next/link";
import { Home, Search, Eye, Plus, RefreshCw, KeyRound } from "lucide-react";
import { useSmartHomes } from "../../api/useSmartHomes";
import AssignOwnerModal from "../../ui/AssignOwnerModal";
import { useAssignOwner, type AssignOwnerOptions } from "../../api/useAssignOwner";
import {
  LoadErrorBar, StatusBadge, EmptyState, useToast, BTN_PRIMARY, BTN_SM, BTN_SM_BRAND, CARD, MUTED_DASH, SEARCH_INPUT, SEGMENTED, TABLE_HEAD_ROW, TH, TOOLBAR, TR, segmentButton,
} from "@shh/ui";
import { useDebouncedValue, formatDate } from "@shh/utils";
import type { HomeStatus } from "@shh/api-client/dashboard";

type Tab = "all" | HomeStatus;

const TABS: { value: Tab; label: string }[] = [
  { value: "all", label: "Tất cả" },
  { value: "unclaimed", label: "Unclaimed" },
  { value: "active", label: "Active" },
  { value: "suspended", label: "Suspended" },
];

export default function SmartHomeListPage() {
  const { showToast } = useToast();
  const [tab, setTab] = useState<Tab>("all");
  const [search, setSearch] = useState("");
  const q = useDebouncedValue(search, 300);
  const { homes, isLoading, isValidating, error, refresh } = useSmartHomes({ status: tab === "all" ? null : tab, q });
  const [assignTarget, setAssignTarget] = useState<{ id: number; name: string } | null>(null);

  return (
    <div className="w-full space-y-3">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold text-gray-900 dark:text-slate-100">Smart Homes</h1>
          <p className="mt-0.5 text-sm text-gray-500 dark:text-slate-400">Danh sách nhà thông minh theo khách hàng và trạng thái kích hoạt.</p>
        </div>
        <Link href="/smart-homes/new" className={BTN_PRIMARY}>
          <Plus className="h-3.5 w-3.5" />
          Tạo Smart Home mới
        </Link>
      </div>

      <div className={`overflow-hidden ${CARD}`}>
        <div className={TOOLBAR}>
          <div className={SEGMENTED}>
            {TABS.map(({ value, label }) => (
              <button key={value} type="button" onClick={() => setTab(value)} className={segmentButton(tab === value)}>
                {label}
              </button>
            ))}
          </div>

          <div className="relative min-w-48 max-w-72 flex-1">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400 dark:text-slate-500" />
            <input
              type="text"
              placeholder="Tìm theo tên nhà, địa chỉ hoặc chủ nhà…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className={SEARCH_INPUT}
            />
          </div>

          <div className="ml-auto flex items-center gap-2 text-xs text-gray-400 dark:text-slate-500">
            {isLoading || (isValidating && homes.length === 0)
              ? <><RefreshCw className="h-3.5 w-3.5 animate-spin" /> Đang tải…</>
              : <span><span className="font-semibold text-gray-700 dark:text-slate-300">{homes.length}</span> nhà</span>}
          </div>
        </div>

        {!!error && <LoadErrorBar error={error} onRetry={refresh} />}

        {!isLoading && homes.length === 0 ? (
          <EmptyState
            icon={Home}
            title={search || tab !== "all" ? "Không tìm thấy nhà phù hợp" : "Chưa có Smart Home nào"}
            description={search || tab !== "all" ? "Thử đổi bộ lọc hoặc từ khoá." : "Bấm “Tạo Smart Home mới” để chuẩn bị kit đầu tiên."}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full table-auto text-left text-sm">
              <thead>
                <tr className={TABLE_HEAD_ROW}>
                  <th className={TH}>Home</th>
                  <th className={TH}>Chủ nhà</th>
                  <th className={TH}>Gói</th>
                  <th className={TH}>Trạng thái</th>
                  <th className={TH}>Gateway</th>
                  <th className={TH}>Phòng / Thiết bị</th>
                  <th className={TH}>Ngày tạo</th>
                  <th className={TH}>Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                {homes.map((h) => (
                  <tr key={h.id} className={TR}>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-gray-900 dark:text-slate-100">{h.name}</p>
                      <p className="mt-0.5 text-xs text-gray-400 dark:text-slate-500">{h.address || "Chưa có địa chỉ"}</p>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 dark:text-slate-300">
                      {h.owner_name && h.owner_customer_id ? (
                        <Link href={`/customers/${h.owner_customer_id}`} className="hover:text-brand">{h.owner_name}</Link>
                      ) : h.owner_name ?? <span className={MUTED_DASH}>—</span>}
                    </td>
                    <td className="px-4 py-3 font-mono text-sm text-gray-500 dark:text-slate-400">{h.package}</td>
                    <td className="px-4 py-3"><StatusBadge status={h.status} /></td>
                    <td className="px-4 py-3">
                      {h.gateway_online === null ? (
                        <span className={MUTED_DASH}>— chưa gán</span>
                      ) : (
                        <div className="flex flex-col gap-0.5">
                          <StatusBadge status={h.gateway_online ? "online" : "offline"} />
                          {h.gateway_uid && <span className="font-mono text-[11px] text-gray-400 dark:text-slate-500">{h.gateway_uid}</span>}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500 dark:text-slate-400">{h.room_count} / {h.device_count}</td>
                    <td className="px-4 py-3 text-sm text-gray-500 dark:text-slate-400">{formatDate(h.created_at)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <Link href={`/smart-homes/${h.id}`} className={BTN_SM}>
                          <Eye className="h-3 w-3" />
                          Chi tiết
                        </Link>
                        {h.status === "unclaimed" && (
                          <button type="button" onClick={() => setAssignTarget({ id: h.id, name: h.name })} className={BTN_SM_BRAND}>
                            <KeyRound className="h-3 w-3" />
                            Gán khách hàng
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {assignTarget && (
        <AssignOwnerDialog
          homeId={assignTarget.id}
          homeName={assignTarget.name}
          onClose={() => setAssignTarget(null)}
          onAssigned={(customer) => {
            void refresh();
            showToast(`Đã gán "${assignTarget.name}" cho ${customer.name}.`);
          }}
        />
      )}
    </div>
  );
}

// Hộp thoại gán chủ = hook (api/useAssignOwner) + view (ui/AssignOwnerModal).
function AssignOwnerDialog({ homeName, ...options }: AssignOwnerOptions & { homeName: string }) {
  const state = useAssignOwner(options);
  return <AssignOwnerModal homeName={homeName} state={state} onClose={options.onClose} />;
}
