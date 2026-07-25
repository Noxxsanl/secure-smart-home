"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  Lock, Unlock, Trash2, MapPin, Hash, Activity, RefreshCw, ArrowLeft,
  Thermometer, Droplets, Home as HomeIcon,
} from "lucide-react";
import OnlineIndicator from "@/features/devices/components/OnlineIndicator";
import StatusBadge from "@/shared/ui/StatusBadge";
import ConfirmDialog from "@/shared/ui/ConfirmDialog";
import SensorChart from "@/features/devices/components/SensorChart";
import { useDeviceDetail } from "@/features/devices/hooks/useDeviceDetail";
import { useSensorData } from "@/features/devices/hooks/useSensorData";
import { smartHomeStore, roomStore } from "@/shared/mock/store";
import type { ApiDeviceStatus } from "@/shared/types/api";

type PendingAction = "lock" | "unlock" | "delete" | null;

function formatLastSeen(lastSeen: string | null): string {
  if (!lastSeen) return "Chưa kết nối";
  const diff = Math.floor((Date.now() - new Date(lastSeen).getTime()) / 1000);
  if (diff < 60)    return `${diff}s ago`;
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("vi-VN", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
}

function InfoCell({ label, icon, children }: { label: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 p-3.5">
      <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400 dark:text-slate-500">{label}</p>
      <div className="flex items-center gap-2">
        {icon && <span className="shrink-0 text-gray-400 dark:text-slate-500">{icon}</span>}
        <span className="text-sm font-semibold text-gray-900 dark:text-slate-100">{children}</span>
      </div>
    </div>
  );
}

export default function DeviceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const { device, isLoading, isError, updateStatus, deleteDevice } = useDeviceDetail(id);
  const isSensor = device?.category === "sensor";
  const { sensorData, isLoading: chartLoading } = useSensorData(isSensor ? id : null);

  const [pending, setPending]             = useState<PendingAction>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const handleConfirm = async () => {
    if (!pending || !device) return;
    setActionLoading(true);
    try {
      if (pending === "delete") {
        await deleteDevice();
        router.push("/devices");
        return;
      }
      const newStatus: ApiDeviceStatus = pending === "lock" ? "blocked" : "active";
      await updateStatus(newStatus);
    } finally {
      setActionLoading(false);
      setPending(null);
    }
  };

  const recentData = [...sensorData]
    .sort((a, b) => new Date(b.received_at).getTime() - new Date(a.received_at).getTime())
    .slice(0, 20);

  if (isLoading) {
    return (
      <div className="flex min-h-[calc(100vh-5rem)] items-center justify-center">
        <div className="flex items-center gap-2 text-sm text-gray-400 dark:text-slate-500">
          <RefreshCw className="h-4 w-4 animate-spin" />
          Đang tải thiết bị…
        </div>
      </div>
    );
  }

  if (isError || !device) {
    return (
      <div className="flex min-h-[calc(100vh-5rem)] flex-col items-center justify-center gap-4">
        <p className="text-critical">Không có quyền truy cập hoặc thiết bị không tồn tại.</p>
        <Link href="/devices"
          className="inline-flex items-center gap-2 rounded border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-3.5 py-1.5 text-sm font-medium text-gray-700 dark:text-slate-300 transition hover:bg-gray-50 dark:hover:bg-slate-700">
          <ArrowLeft className="h-4 w-4" />
          Trở về Devices
        </Link>
      </div>
    );
  }

  const home = smartHomeStore.get(device.home_id);
  const room = roomStore.get(device.room_id);

  const dialogProps =
    pending === "delete"
      ? { title: "Xóa thiết bị",    description: `Xóa vĩnh viễn "${device.device_name}"?`, confirmLabel: "Xóa",      danger: true  }
      : pending === "lock"
      ? { title: "Khóa thiết bị",   description: `Khóa "${device.device_name}"?`,           confirmLabel: "Khóa",     danger: true  }
      : { title: "Mở khóa thiết bị", description: `Mở khóa "${device.device_name}"?`,       confirmLabel: "Mở khóa",  danger: false };

  return (
    <div className="w-full space-y-3">

      {/* Page header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2.5">
          <Link
            href="/devices"
            className="inline-flex items-center gap-1.5 rounded border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-1.5 text-sm font-medium text-gray-600 dark:text-slate-300 transition hover:bg-gray-50 dark:hover:bg-slate-700"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Trở về Devices
          </Link>

          {home && (
            <div className="flex items-center gap-1.5 text-xs text-gray-400 dark:text-slate-500">
              <HomeIcon size={12} />
              <Link href={`/smart-homes/${home.id}`} className="hover:text-brand">{home.name}</Link>
              {room && <span>/ {room.name}</span>}
            </div>
          )}

          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded bg-gray-100 dark:bg-slate-700">
              <Hash className="h-4 w-4 text-gray-500 dark:text-slate-400" />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="text-lg font-semibold text-gray-900 dark:text-slate-100">{device.device_name}</h1>
                <StatusBadge status={device.status} />
              </div>
              <p className="mt-0.5 font-mono text-xs text-gray-400 dark:text-slate-500">{device.device_id}</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {device.status === "blocked" ? (
            <button type="button" onClick={() => setPending("unlock")}
              className="inline-flex items-center gap-1.5 rounded border border-success/30 bg-success-soft px-3.5 py-1.5 text-sm font-medium text-success transition hover:brightness-95">
              <Unlock className="h-3.5 w-3.5" />
              Mở khóa
            </button>
          ) : (
            <button type="button" onClick={() => setPending("lock")}
              className="inline-flex items-center gap-1.5 rounded border border-warning/30 bg-warning-soft px-3.5 py-1.5 text-sm font-medium text-warning transition hover:brightness-95">
              <Lock className="h-3.5 w-3.5" />
              Khóa
            </button>
          )}
          <button type="button" onClick={() => setPending("delete")}
            className="inline-flex items-center gap-1.5 rounded border border-critical/20 bg-critical-soft px-3.5 py-1.5 text-sm font-medium text-critical transition hover:brightness-95">
            <Trash2 className="h-3.5 w-3.5" />
            Xóa
          </button>
        </div>
      </div>

      {/* Device info grid */}
      <div className="overflow-hidden rounded-md border border-[#E5EAF0] dark:border-slate-700 bg-white dark:bg-slate-800">
        <div className="border-b border-gray-200 dark:border-slate-700 bg-[#F4F5F7] dark:bg-slate-900 px-4 py-2">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-500 dark:text-slate-400">Thông tin thiết bị</p>
        </div>
        <div className="grid divide-y divide-gray-100 dark:divide-slate-700 sm:grid-cols-2 xl:grid-cols-4 sm:divide-x sm:divide-y-0 dark:sm:divide-x-slate-700">
          <InfoCell label="Loại">
            <span className="capitalize">{device.category.replace("_", " ")}</span>
          </InfoCell>
          <InfoCell label="Trạng thái">
            <StatusBadge status={device.status} />
          </InfoCell>
          <InfoCell label="Kết nối">
            <OnlineIndicator lastSeen={device.last_seen} />
          </InfoCell>
          <InfoCell label="Hoạt động gần nhất">
            {formatLastSeen(device.last_seen)}
          </InfoCell>
        </div>

        <div className="grid divide-y divide-gray-100 dark:divide-slate-700 border-t border-gray-100 dark:border-slate-700 sm:grid-cols-2 xl:grid-cols-4 sm:divide-x sm:divide-y-0">
          {device.location && (
            <InfoCell label="Vị trí" icon={<MapPin size={14} />}>
              {device.location}
            </InfoCell>
          )}
          <InfoCell label="Fail Count" icon={<Activity size={14} />}>
            <span className={device.fail_count > 0 ? "text-warning" : "text-gray-900 dark:text-slate-100"}>
              {device.fail_count}
            </span>
          </InfoCell>
          <InfoCell label="Device ID" icon={<Hash size={14} />}>
            <span className="font-mono text-xs">{device.device_id}</span>
          </InfoCell>
        </div>
      </div>

      {/* Sensor-only: chart + recent data */}
      {isSensor && (
        <>
          <SensorChart data={sensorData} isLoading={chartLoading} />

          <div className="overflow-hidden rounded-md border border-[#E5EAF0] dark:border-slate-700 bg-white dark:bg-slate-800">
            <div className="border-b border-gray-200 dark:border-slate-700 bg-[#F4F5F7] dark:bg-slate-900 px-4 py-2">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-500 dark:text-slate-400">Dữ liệu gần nhất</p>
            </div>

            {recentData.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <Activity className="mb-3 h-8 w-8 text-gray-200 dark:text-slate-700" />
                <p className="text-sm text-gray-400 dark:text-slate-500">Chưa có dữ liệu cảm biến.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full table-auto text-left text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-slate-700 bg-[#F4F5F7] dark:bg-slate-900">
                      <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400">Thời gian</th>
                      <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400">
                        <span className="flex items-center gap-1"><Thermometer size={11} /> Nhiệt độ (°C)</span>
                      </th>
                      <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400">
                        <span className="flex items-center gap-1"><Droplets size={11} /> Độ ẩm (%)</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                    {recentData.map((record) => (
                      <tr key={record.id} className="bg-white dark:bg-slate-800 transition-colors hover:bg-brand-soft/30">
                        <td className="px-4 py-2.5 font-mono text-xs text-gray-500 dark:text-slate-400">
                          {formatDateTime(record.received_at)}
                        </td>
                        <td className="px-4 py-2.5 font-semibold text-warning">
                          {record.payload?.temperature !== undefined
                            ? `${record.payload.temperature}°C`
                            : <span className="text-gray-300 dark:text-slate-600">—</span>
                          }
                        </td>
                        <td className="px-4 py-2.5 font-semibold text-info">
                          {record.payload?.humidity !== undefined
                            ? `${record.payload.humidity}%`
                            : <span className="text-gray-300 dark:text-slate-600">—</span>
                          }
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      <ConfirmDialog
        open={!!pending}
        title={dialogProps.title}
        description={dialogProps.description}
        confirmLabel={actionLoading ? "Đang xử lý…" : dialogProps.confirmLabel}
        danger={dialogProps.danger}
        onConfirm={handleConfirm}
        onCancel={() => !actionLoading && setPending(null)}
      />
    </div>
  );
}
