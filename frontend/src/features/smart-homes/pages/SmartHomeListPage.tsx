"use client";

import { useState } from "react";
import Link from "next/link";
import { Home, Search, Eye, Plus, RefreshCw, KeyRound } from "lucide-react";
import { useSmartHomes } from "@/features/smart-homes/hooks/useSmartHomes";
import StatusBadge from "@/shared/ui/StatusBadge";
import EmptyState from "@/shared/ui/EmptyState";
import AssignOwnerModal from "@/features/smart-homes/components/AssignOwnerModal";
import { useToast } from "@/shared/ui/Toast";
import { smartHomeStore } from "@/shared/mock/store";
import type { HomeStatus } from "@/shared/mock/types";

type Tab = "all" | HomeStatus;

const TABS: { value: Tab; label: string }[] = [
  { value: "all", label: "Tất cả" },
  { value: "unclaimed", label: "Unclaimed" },
  { value: "active", label: "Active" },
  { value: "suspended", label: "Suspended" },
];

export default function SmartHomeListPage() {
  const { homes, isLoading, refresh } = useSmartHomes();
  const { showToast } = useToast();
  const [tab, setTab] = useState<Tab>("all");
  const [search, setSearch] = useState("");
  const [assignTarget, setAssignTarget] = useState<{ id: number; name: string } | null>(null);

  function handleAssign(customerId: number) {
    if (!assignTarget) return;
    smartHomeStore.assignOwner(assignTarget.id, customerId);
    refresh();
    showToast(`Đã gán "${assignTarget.name}" cho khách hàng.`);
  }

  const filtered = homes
    .filter((h) => tab === "all" || h.status === tab)
    .filter((h) =>
      search.trim()
        ? h.name.toLowerCase().includes(search.toLowerCase()) || (h.ownerName ?? "").toLowerCase().includes(search.toLowerCase())
        : true
    );

  return (
    <div className="w-full space-y-3">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold text-gray-900 dark:text-slate-100">Smart Homes</h1>
          <p className="mt-0.5 text-sm text-gray-500 dark:text-slate-400">Danh sách nhà thông minh theo khách hàng và trạng thái kích hoạt.</p>
        </div>
        <Link
          href="/smart-homes/new"
          className="inline-flex items-center gap-1.5 rounded bg-brand px-3.5 py-1.5 text-sm font-semibold text-white transition hover:brightness-90"
        >
          <Plus className="h-3.5 w-3.5" />
          Tạo Smart Home mới
        </Link>
      </div>

      <div className="overflow-hidden rounded-md border border-[#E5EAF0] dark:border-slate-700 bg-white dark:bg-slate-800">
        <div className="flex flex-wrap items-center gap-2.5 border-b border-gray-200 dark:border-slate-700 bg-[#F4F5F7] dark:bg-slate-900 px-4 py-2.5">
          <div className="flex items-center rounded border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-800 p-0.5 gap-0.5">
            {TABS.map(({ value, label }) => (
              <button
                key={value}
                type="button"
                onClick={() => setTab(value)}
                className={`rounded px-3 py-1 text-xs font-semibold transition
                  ${tab === value ? "bg-brand-soft text-brand" : "text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200"}`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="relative min-w-48 max-w-72 flex-1">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400 dark:text-slate-500" />
            <input
              type="text"
              placeholder="Tìm theo tên nhà hoặc chủ nhà…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 w-full rounded border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 pl-8 pr-3 text-sm text-gray-900 dark:text-slate-100 placeholder:text-gray-300 dark:placeholder:text-slate-500 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/15"
            />
          </div>

          <div className="ml-auto flex items-center gap-2 text-xs text-gray-400 dark:text-slate-500">
            {isLoading
              ? <><RefreshCw className="h-3.5 w-3.5 animate-spin" /> Đang tải…</>
              : <span><span className="font-semibold text-gray-700 dark:text-slate-300">{filtered.length}</span> nhà</span>
            }
          </div>
        </div>

        {!isLoading && filtered.length === 0 ? (
          <EmptyState icon={Home} title={search ? "Không tìm thấy nhà phù hợp" : "Chưa có Smart Home nào"} />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full table-auto text-left text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-slate-700 bg-[#F4F5F7] dark:bg-slate-900">
                  <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400">Home</th>
                  <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400">Chủ nhà</th>
                  <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400">Gói</th>
                  <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400">Trạng thái</th>
                  <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400">Gateway</th>
                  <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400">Rooms</th>
                  <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                {filtered.map((h) => (
                  <tr key={h.id} className="bg-white dark:bg-slate-800 transition-colors hover:bg-brand-soft/30">
                    <td className="px-4 py-3">
                      <p className="font-semibold text-gray-900 dark:text-slate-100">{h.name}</p>
                      <p className="mt-0.5 text-xs text-gray-400 dark:text-slate-500">{h.address}</p>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 dark:text-slate-300">
                      {h.ownerName ?? <span className="text-gray-300 dark:text-slate-600">—</span>}
                    </td>
                    <td className="px-4 py-3 text-sm font-mono text-gray-500 dark:text-slate-400">{h.package}</td>
                    <td className="px-4 py-3"><StatusBadge status={h.status} /></td>
                    <td className="px-4 py-3">
                      {h.gatewayOnline === null
                        ? <span className="text-gray-300 dark:text-slate-600">— chưa gán</span>
                        : <StatusBadge status={h.gatewayOnline ? "online" : "offline"} />
                      }
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500 dark:text-slate-400">{h.roomCount}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <Link
                          href={`/smart-homes/${h.id}`}
                          className="inline-flex items-center gap-1 rounded border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 px-2.5 py-1 text-xs font-medium text-gray-600 dark:text-slate-300 transition hover:border-brand hover:bg-brand-soft hover:text-brand"
                        >
                          <Eye className="h-3 w-3" />
                          Chi tiết
                        </Link>
                        {h.status === "unclaimed" && (
                          <button
                            type="button"
                            onClick={() => setAssignTarget({ id: h.id, name: h.name })}
                            className="inline-flex items-center gap-1 rounded border border-brand/30 bg-brand-soft px-2.5 py-1 text-xs font-medium text-brand transition hover:brightness-95"
                          >
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

      <AssignOwnerModal
        open={!!assignTarget}
        homeName={assignTarget?.name ?? ""}
        onClose={() => setAssignTarget(null)}
        onAssign={handleAssign}
      />
    </div>
  );
}
