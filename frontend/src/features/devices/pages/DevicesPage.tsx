"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Server, Cpu, Lock, Unlock, Power, Trash2,
  RefreshCw, Plus, Eye, CheckCircle, XCircle, Search,
} from "lucide-react";
import { useDeviceList } from "@/features/devices/hooks/useDeviceList";
import { usePermissions } from "@/features/auth/hooks/usePermissions";
import DeviceStatusBadge from "@/features/devices/components/DeviceStatusBadge";
import OnlineIndicator from "@/features/devices/components/OnlineIndicator";
import ConfirmDialog from "@/shared/ui/ConfirmDialog";
import { AddDeviceModal } from "@/features/devices/components/AddDeviceModal";
import { FetchError } from "@/shared/api/errors";
import type { ApiDevice, ApiDeviceStatus } from "@/shared/types/api";

type Tab = "gateway" | "sensor";

type PendingAction =
  | { type: "delete"; device: ApiDevice }
  | { type: "lock"; device: ApiDevice }
  | { type: "unlock"; device: ApiDevice }
  | { type: "activate"; device: ApiDevice }
  | null;

type Toast = { msg: string; ok: boolean } | null;

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
  const { canCreateDevice, canUpdateDeviceStatus, canDeleteDevice } = usePermissions();

  const [activeTab, setActiveTab]   = useState<Tab>("gateway");
  const [pending, setPending]       = useState<PendingAction>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [addModalOpen, setAddModalOpen]   = useState(false);
  const [toast, setToast]           = useState<Toast>(null);
  const [search, setSearch]         = useState("");

  function showToast(msg: string, ok = true) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  }

  const gateways = devices.filter((d) => d.device_type === "gateway");
  const sensors  = devices.filter((d) => d.device_type === "sensor");

  const sourceList = activeTab === "gateway" ? gateways : sensors;
  const tableDevices = search.trim()
    ? sourceList.filter(
        (d) =>
          d.device_name.toLowerCase().includes(search.toLowerCase()) ||
          d.device_id.toLowerCase().includes(search.toLowerCase()),
      )
    : sourceList;

  const handleConfirm = async () => {
    if (!pending) return;
    if (pending.type === "delete" && !canDeleteDevice) {
      showToast("Không có quyền truy cập.", false); setPending(null); return;
    }
    if ((pending.type === "lock" || pending.type === "unlock" || pending.type === "activate") && !canUpdateDeviceStatus) {
      showToast("Không có quyền truy cập.", false); setPending(null); return;
    }
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
    } catch (err: unknown) {
      showToast(err instanceof FetchError && err.status === 403 ? "Không có quyền truy cập." : "Thao tác thất bại.", false);
    } finally {
      setActionLoading(false); setPending(null);
    }
  };

  const confirmDialog =
    pending?.type === "delete"   ? { title: "Xóa thiết bị",    description: `Xóa vĩnh viễn "${pending.device.device_name}"?`, confirmLabel: "Xóa",       danger: true  } :
    pending?.type === "lock"     ? { title: "Khóa thiết bị",   description: `Khóa "${pending?.device.device_name}"?`,         confirmLabel: "Khóa",      danger: true  } :
    pending?.type === "activate" ? { title: "Kích hoạt",       description: `Kích hoạt "${pending?.device.device_name}"?`,    confirmLabel: "Kích hoạt", danger: false } :
                                   { title: "Mở khóa",         description: `Mở khóa "${pending?.device.device_name}"?`,      confirmLabel: "Mở khóa",  danger: false };

  const activeGateways = gateways.filter((d) => d.status === "active").length;
  const activeSensors  = sensors.filter((d) => d.status === "active").length;

  return (
    <div className="w-full space-y-3">

      {/* Page header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold text-gray-900 dark:text-slate-100">Fleet registry</h1>
          <p className="mt-0.5 text-sm text-gray-500 dark:text-slate-400">Quản lý trạng thái, quyền truy cập và bảo mật thiết bị.</p>
        </div>
        {canCreateDevice && (
          <button
            type="button"
            onClick={() => setAddModalOpen(true)}
            className="inline-flex items-center gap-1.5 rounded bg-blue-600 px-3.5 py-1.5 text-sm font-semibold text-white transition hover:bg-blue-700"
          >
            <Plus className="h-3.5 w-3.5" />
            Thêm thiết bị
          </button>
        )}
      </div>

      {/* Stat cards */}
      <div className="grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => setActiveTab("gateway")}
          className={`rounded-md border bg-white dark:bg-slate-800 p-3.5 text-left transition
            ${activeTab === "gateway" ? "border-blue-200 ring-1 ring-blue-400/30" : "border-[#E5EAF0] dark:border-slate-700 hover:border-gray-300 dark:hover:border-slate-600"}`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded bg-blue-50">
                <Server className="h-4 w-4 text-blue-600" />
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400 dark:text-slate-500">Gateways</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-slate-100">{gateways.length}</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-xl font-bold text-emerald-600">{activeGateways}</p>
              <p className="text-xs text-gray-400 dark:text-slate-500">active</p>
            </div>
          </div>
          <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-slate-700">
            <div
              className="h-full rounded-full bg-emerald-500 transition-all"
              style={{ width: gateways.length ? `${(activeGateways / gateways.length) * 100}%` : "0%" }}
            />
          </div>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("sensor")}
          className={`rounded-md border bg-white dark:bg-slate-800 p-3.5 text-left transition
            ${activeTab === "sensor" ? "border-violet-200 ring-1 ring-violet-400/30" : "border-[#E5EAF0] dark:border-slate-700 hover:border-gray-300 dark:hover:border-slate-600"}`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded bg-violet-50">
                <Cpu className="h-4 w-4 text-violet-600" />
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400 dark:text-slate-500">Sensors</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-slate-100">{sensors.length}</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-xl font-bold text-emerald-600">{activeSensors}</p>
              <p className="text-xs text-gray-400 dark:text-slate-500">active</p>
            </div>
          </div>
          <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-slate-700">
            <div
              className="h-full rounded-full bg-emerald-500 transition-all"
              style={{ width: sensors.length ? `${(activeSensors / sensors.length) * 100}%` : "0%" }}
            />
          </div>
        </button>
      </div>

      {/* Table card */}
      <div className="overflow-hidden rounded-md border border-[#E5EAF0] dark:border-slate-700 bg-white dark:bg-slate-800">

        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-2.5 border-b border-gray-200 dark:border-slate-700 bg-[#F4F5F7] dark:bg-slate-900 px-4 py-2.5">
          <div className="flex items-center rounded border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-800 p-0.5 gap-0.5">
            {(["gateway", "sensor"] as const).map((tab) => {
              const isGw = tab === "gateway";
              const count = isGw ? gateways.length : sensors.length;
              return (
                <button
                  key={tab}
                  type="button"
                  onClick={() => { setActiveTab(tab); setSearch(""); }}
                  className={`flex items-center gap-1.5 rounded px-3 py-1 text-xs font-semibold transition
                    ${activeTab === tab
                      ? isGw ? "bg-blue-50 text-blue-600" : "bg-violet-50 text-violet-600"
                      : "text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200"
                    }`}
                >
                  {isGw ? <Server className="h-3 w-3" /> : <Cpu className="h-3 w-3" />}
                  {isGw ? "Gateway" : "Sensor"}
                  <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold
                    ${activeTab === tab
                      ? isGw ? "bg-blue-100 text-blue-700" : "bg-violet-100 text-violet-700"
                      : "bg-gray-100 dark:bg-slate-700 text-gray-500 dark:text-slate-400"
                    }`}>
                    {count}
                  </span>
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
              className="h-8 w-full rounded border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 pl-8 pr-3 text-sm text-gray-900 dark:text-slate-100 placeholder:text-gray-300 dark:placeholder:text-slate-500 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/15"
            />
          </div>

          <div className="ml-auto flex items-center gap-2 text-xs text-gray-400 dark:text-slate-500">
            {isLoading && <><RefreshCw className="h-3.5 w-3.5 animate-spin" /> Đang tải…</>}
            {isError   && <span className="text-red-500">Không có quyền truy cập</span>}
            {!isLoading && !isError && (
              <span>
                <span className="font-semibold text-gray-700 dark:text-slate-300">{tableDevices.length}</span> thiết bị
              </span>
            )}
          </div>
        </div>

        {/* Table */}
        {!isError && tableDevices.length === 0 && !isLoading ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            {activeTab === "gateway"
              ? <Server className="mb-3 h-9 w-9 text-gray-200 dark:text-slate-700" />
              : <Cpu className="mb-3 h-9 w-9 text-gray-200 dark:text-slate-700" />
            }
            <p className="text-sm font-medium text-gray-400 dark:text-slate-500">
              {search ? "Không tìm thấy thiết bị phù hợp" : `Chưa có ${activeTab} nào`}
            </p>
            {!search && canCreateDevice && (
              <button
                onClick={() => setAddModalOpen(true)}
                className="mt-3 inline-flex items-center gap-1.5 rounded bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 transition"
              >
                <Plus size={12} /> Thêm thiết bị đầu tiên
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full table-auto text-left text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-slate-700 bg-[#F4F5F7] dark:bg-slate-900">
                  <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400">Thiết bị</th>
                  <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400">Trạng thái</th>
                  <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400">Kết nối</th>
                  <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400">Vị trí</th>
                  <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400">Hoạt động</th>
                  <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                {tableDevices.map((device) => (
                  <tr key={device.id} className="bg-white dark:bg-slate-800 transition-colors hover:bg-blue-50/40 dark:hover:bg-blue-900/20">
                    <td className="px-4 py-3">
                      <p className="font-semibold text-gray-900 dark:text-slate-100">{device.device_name}</p>
                      <p className="mt-0.5 font-mono text-xs text-gray-400 dark:text-slate-500">{device.device_id}</p>
                    </td>
                    <td className="px-4 py-3">
                      <DeviceStatusBadge status={device.status} />
                    </td>
                    <td className="px-4 py-3">
                      <OnlineIndicator lastSeen={device.last_seen} />
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500 dark:text-slate-400">
                      {device.location || <span className="text-gray-300 dark:text-slate-600">—</span>}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-400 dark:text-slate-500">
                      {formatLastSeen(device.last_seen)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <Link
                          href={`/devices/${device.id}`}
                          className="inline-flex items-center gap-1 rounded border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 px-2.5 py-1 text-xs font-medium text-gray-600 dark:text-slate-300 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 dark:hover:border-blue-700 dark:hover:bg-blue-900/30 dark:hover:text-blue-300"
                        >
                          <Eye className="h-3 w-3" />
                          Chi tiết
                        </Link>

                        {canUpdateDeviceStatus && (
                          device.status === "inactive" ? (
                            <button type="button" onClick={() => setPending({ type: "activate", device })}
                              className="inline-flex items-center gap-1 rounded border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 transition hover:bg-emerald-100">
                              <Power className="h-3 w-3" /> Kích hoạt
                            </button>
                          ) : device.status === "blocked" ? (
                            <button type="button" onClick={() => setPending({ type: "unlock", device })}
                              className="inline-flex items-center gap-1 rounded border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 transition hover:bg-emerald-100">
                              <Unlock className="h-3 w-3" /> Mở khóa
                            </button>
                          ) : (
                            <button type="button" onClick={() => setPending({ type: "lock", device })}
                              className="inline-flex items-center gap-1 rounded border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700 transition hover:bg-amber-100">
                              <Lock className="h-3 w-3" /> Khóa
                            </button>
                          )
                        )}

                        {canDeleteDevice && (
                          <button type="button" onClick={() => setPending({ type: "delete", device })}
                            className="inline-flex items-center gap-1 rounded border border-red-100 bg-red-50 px-2.5 py-1 text-xs font-medium text-red-600 transition hover:bg-red-100">
                            <Trash2 className="h-3 w-3" /> Xóa
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

      {/* Dialogs */}
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

      {canCreateDevice && (
        <AddDeviceModal
          open={addModalOpen}
          onClose={() => setAddModalOpen(false)}
          onSuccess={() => showToast("Đăng ký thiết bị thành công.")}
        />
      )}

      {toast && (
        <div className={`fixed bottom-5 right-5 z-50 flex items-center gap-2 rounded-md px-4 py-2.5 text-sm font-semibold shadow-lg transition
          ${toast.ok ? "bg-emerald-600 text-white" : "bg-red-600 text-white"}`}>
          {toast.ok
            ? <CheckCircle className="h-4 w-4 shrink-0" />
            : <XCircle    className="h-4 w-4 shrink-0" />
          }
          {toast.msg}
        </div>
      )}
    </div>
  );
}
