"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Cpu, ToggleLeft, Camera, DoorClosed, Lock, Unlock, Power, Trash2,
  RefreshCw, Eye, Search,
} from "lucide-react";
import { useDeviceList } from "@/features/devices/hooks/useDeviceList";
import { usePermissions } from "@/features/auth/hooks/usePermissions";
import StatusBadge from "@/shared/ui/StatusBadge";
import OnlineIndicator from "@/features/devices/components/OnlineIndicator";
import ConfirmDialog from "@/shared/ui/ConfirmDialog";
import EmptyState from "@/shared/ui/EmptyState";
import { useToast } from "@/shared/ui/Toast";
import { smartHomeStore, roomStore } from "@/shared/mock/store";
import type { MockDevice, DeviceCategory } from "@/shared/mock/types";
import type { ApiDeviceStatus } from "@/shared/types/api";

type Category = "all" | DeviceCategory;

const CATEGORY_META: Record<DeviceCategory, { label: string; icon: React.ElementType }> = {
  sensor: { label: "Sensor", icon: Cpu },
  relay: { label: "Relay", icon: ToggleLeft },
  camera: { label: "Camera", icon: Camera },
  door_contact: { label: "Door Contact", icon: DoorClosed },
};

type PendingAction =
  | { type: "delete"; device: MockDevice }
  | { type: "lock"; device: MockDevice }
  | { type: "unlock"; device: MockDevice }
  | { type: "activate"; device: MockDevice }
  | null;

function formatLastSeen(lastSeen: string | null): string {
  if (!lastSeen) return "Chưa kết nối";
  const diff = Math.floor((Date.now() - new Date(lastSeen).getTime()) / 1000);
  if (diff < 60)    return `${diff}s ago`;
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export default function DevicesPage() {
  const { devices, isLoading, isError, updateStatus, deleteDevice } = useDeviceList();
  const { canUpdateDeviceStatus, canDeleteDevice } = usePermissions();
  const { showToast } = useToast();

  const [category, setCategory] = useState<Category>("all");
  const [pending, setPending]       = useState<PendingAction>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [search, setSearch]         = useState("");

  const filteredByCategory = category === "all" ? devices : devices.filter((d) => d.category === category);
  const tableDevices = search.trim()
    ? filteredByCategory.filter(
        (d) =>
          d.device_name.toLowerCase().includes(search.toLowerCase()) ||
          d.device_id.toLowerCase().includes(search.toLowerCase()),
      )
    : filteredByCategory;

  const categoryCounts = devices.reduce<Record<string, number>>((acc, d) => {
    acc[d.category] = (acc[d.category] ?? 0) + 1;
    return acc;
  }, {});

  const handleConfirm = async () => {
    if (!pending) return;
    setActionLoading(true);
    try {
      if (pending.type === "delete") {
        await deleteDevice(pending.device.id);
        showToast(`Đã xóa "${pending.device.device_name}".`);
      } else {
        const newStatus: ApiDeviceStatus = pending.type === "lock" ? "blocked" : "active";
        await updateStatus(pending.device.id, newStatus);
        showToast(`Thiết bị đã được ${pending.type === "lock" ? "khóa" : pending.type === "activate" ? "kích hoạt" : "mở khóa"}.`);
      }
    } finally {
      setActionLoading(false); setPending(null);
    }
  };

  const confirmDialog =
    pending?.type === "delete"   ? { title: "Xóa thiết bị",    description: `Xóa vĩnh viễn "${pending.device.device_name}"?`, confirmLabel: "Xóa",       danger: true  } :
    pending?.type === "lock"     ? { title: "Khóa thiết bị",   description: `Khóa "${pending?.device.device_name}"?`,         confirmLabel: "Khóa",      danger: true  } :
    pending?.type === "activate" ? { title: "Kích hoạt",       description: `Kích hoạt "${pending?.device.device_name}"?`,    confirmLabel: "Kích hoạt", danger: false } :
                                   { title: "Mở khóa",         description: `Mở khóa "${pending?.device.device_name}"?`,      confirmLabel: "Mở khóa",  danger: false };

  return (
    <div className="w-full space-y-3">

      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold text-gray-900 dark:text-slate-100">Devices</h1>
          <p className="mt-0.5 text-sm text-gray-500 dark:text-slate-400">
            Fleet-wide danh sách thiết bị — luôn thuộc một Room trong một Smart Home. Thêm thiết bị mới qua tab Rooms trong Smart Home Detail.
          </p>
        </div>
      </div>

      <div className="overflow-hidden rounded-md border border-[#E5EAF0] dark:border-slate-700 bg-white dark:bg-slate-800">

        <div className="flex flex-wrap items-center gap-2.5 border-b border-gray-200 dark:border-slate-700 bg-[#F4F5F7] dark:bg-slate-900 px-4 py-2.5">
          <div className="flex items-center rounded border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-800 p-0.5 gap-0.5">
            <button
              type="button"
              onClick={() => setCategory("all")}
              className={`rounded px-3 py-1 text-xs font-semibold transition ${category === "all" ? "bg-brand-soft text-brand" : "text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200"}`}
            >
              Tất cả <span className="ml-1 rounded bg-gray-100 dark:bg-slate-700 px-1.5 py-0.5 text-[10px] font-bold">{devices.length}</span>
            </button>
            {(Object.keys(CATEGORY_META) as DeviceCategory[]).map((cat) => {
              const { label, icon: Icon } = CATEGORY_META[cat];
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setCategory(cat)}
                  className={`flex items-center gap-1.5 rounded px-3 py-1 text-xs font-semibold transition
                    ${category === cat ? "bg-brand-soft text-brand" : "text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200"}`}
                >
                  <Icon className="h-3 w-3" />
                  {label}
                  <span className="rounded bg-gray-100 dark:bg-slate-700 px-1.5 py-0.5 text-[10px] font-bold">{categoryCounts[cat] ?? 0}</span>
                </button>
              );
            })}
          </div>

          <div className="relative min-w-48 max-w-72 flex-1">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400 dark:text-slate-500" />
            <input
              type="text"
              placeholder="Tìm tên hoặc Device ID…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 w-full rounded border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 pl-8 pr-3 text-sm text-gray-900 dark:text-slate-100 placeholder:text-gray-300 dark:placeholder:text-slate-500 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/15"
            />
          </div>

          <div className="ml-auto flex items-center gap-2 text-xs text-gray-400 dark:text-slate-500">
            {isLoading && <><RefreshCw className="h-3.5 w-3.5 animate-spin" /> Đang tải…</>}
            {isError   && <span className="text-critical">Không có quyền truy cập</span>}
            {!isLoading && !isError && (
              <span><span className="font-semibold text-gray-700 dark:text-slate-300">{tableDevices.length}</span> thiết bị</span>
            )}
          </div>
        </div>

        {!isError && tableDevices.length === 0 && !isLoading ? (
          <EmptyState icon={Cpu} title={search ? "Không tìm thấy thiết bị phù hợp" : "Chưa có thiết bị nào"} />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full table-auto text-left text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-slate-700 bg-[#F4F5F7] dark:bg-slate-900">
                  <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400">Thiết bị</th>
                  <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400">Smart Home</th>
                  <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400">Room</th>
                  <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400">Trạng thái</th>
                  <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400">Kết nối</th>
                  <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400">Hoạt động</th>
                  <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                {tableDevices.map((device) => {
                  const home = smartHomeStore.get(device.home_id);
                  const room = roomStore.get(device.room_id);
                  return (
                    <tr key={device.id} className="bg-white dark:bg-slate-800 transition-colors hover:bg-brand-soft/30">
                      <td className="px-4 py-3">
                        <p className="font-semibold text-gray-900 dark:text-slate-100">{device.device_name}</p>
                        <p className="mt-0.5 font-mono text-xs text-gray-400 dark:text-slate-500">{device.device_id}</p>
                      </td>
                      <td className="px-4 py-3 text-sm">
                        {home ? (
                          <Link href={`/smart-homes/${home.id}`} className="text-brand hover:brightness-90">{home.name}</Link>
                        ) : <span className="text-gray-300 dark:text-slate-600">—</span>}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500 dark:text-slate-400">{room?.name ?? "—"}</td>
                      <td className="px-4 py-3"><StatusBadge status={device.status} /></td>
                      <td className="px-4 py-3"><OnlineIndicator lastSeen={device.last_seen} /></td>
                      <td className="px-4 py-3 text-sm text-gray-400 dark:text-slate-500">{formatLastSeen(device.last_seen)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <Link
                            href={`/devices/${device.id}`}
                            className="inline-flex items-center gap-1 rounded border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 px-2.5 py-1 text-xs font-medium text-gray-600 dark:text-slate-300 transition hover:border-brand hover:bg-brand-soft hover:text-brand"
                          >
                            <Eye className="h-3 w-3" />
                            Chi tiết
                          </Link>

                          {canUpdateDeviceStatus && (
                            device.status === "inactive" ? (
                              <button type="button" onClick={() => setPending({ type: "activate", device })}
                                className="inline-flex items-center gap-1 rounded border border-success/30 bg-success-soft px-2.5 py-1 text-xs font-medium text-success transition hover:brightness-95">
                                <Power className="h-3 w-3" /> Kích hoạt
                              </button>
                            ) : device.status === "blocked" ? (
                              <button type="button" onClick={() => setPending({ type: "unlock", device })}
                                className="inline-flex items-center gap-1 rounded border border-success/30 bg-success-soft px-2.5 py-1 text-xs font-medium text-success transition hover:brightness-95">
                                <Unlock className="h-3 w-3" /> Mở khóa
                              </button>
                            ) : (
                              <button type="button" onClick={() => setPending({ type: "lock", device })}
                                className="inline-flex items-center gap-1 rounded border border-warning/30 bg-warning-soft px-2.5 py-1 text-xs font-medium text-warning transition hover:brightness-95">
                                <Lock className="h-3 w-3" /> Khóa
                              </button>
                            )
                          )}

                          {canDeleteDevice && (
                            <button type="button" onClick={() => setPending({ type: "delete", device })}
                              className="inline-flex items-center gap-1 rounded border border-critical/20 bg-critical-soft px-2.5 py-1 text-xs font-medium text-critical transition hover:brightness-95">
                              <Trash2 className="h-3 w-3" /> Xóa
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={!!pending}
        title={confirmDialog.title}
        description={confirmDialog.description}
        confirmLabel={actionLoading ? "Đang xử lý…" : confirmDialog.confirmLabel}
        cancelLabel="Huỷ"
        danger={confirmDialog.danger}
        onConfirm={handleConfirm}
        onCancel={() => !actionLoading && setPending(null)}
      />
    </div>
  );
}
