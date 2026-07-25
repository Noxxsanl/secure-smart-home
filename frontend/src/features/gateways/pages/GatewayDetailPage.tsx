"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft, RefreshCw, Wifi, HardDrive, Radio, Clock, QrCode,
  Link2, Layers, Power, RotateCcw, UploadCloud,
} from "lucide-react";
import { useGatewayDetail } from "@/features/gateways/hooks/useGatewayDetail";
import StatusBadge from "@/shared/ui/StatusBadge";
import ConfirmDialog from "@/shared/ui/ConfirmDialog";
import { useToast } from "@/shared/ui/Toast";

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

export default function GatewayDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { detail, isLoading } = useGatewayDetail(Number(id));
  const { showToast } = useToast();
  const [pending, setPending] = useState<"restart" | "reset" | null>(null);

  if (isLoading) {
    return (
      <div className="flex min-h-[calc(100vh-5rem)] items-center justify-center">
        <div className="flex items-center gap-2 text-sm text-gray-400 dark:text-slate-500">
          <RefreshCw className="h-4 w-4 animate-spin" /> Đang tải…
        </div>
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="flex min-h-[calc(100vh-5rem)] flex-col items-center justify-center gap-4">
        <p className="text-critical">Không tìm thấy Gateway.</p>
        <Link href="/gateways" className="inline-flex items-center gap-2 rounded border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-3.5 py-1.5 text-sm font-medium text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700">
          <ArrowLeft className="h-4 w-4" /> Trở về Gateways
        </Link>
      </div>
    );
  }

  const { gateway, home, provisionLogs } = detail;

  function handleConfirm() {
    showToast(pending === "restart" ? "Đã gửi lệnh Restart tới Gateway." : "Đã gửi lệnh Factory Reset tới Gateway.");
    setPending(null);
  }

  return (
    <div className="w-full space-y-3">
      <div>
        <Link href="/gateways" className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200">
          <ArrowLeft className="h-3.5 w-3.5" /> Gateways
        </Link>
        <div className="mt-1.5 flex items-center gap-2.5">
          <h1 className="font-mono text-lg font-semibold text-gray-900 dark:text-slate-100">{gateway.uid}</h1>
          <StatusBadge status={gateway.status} />
        </div>
        {home && (
          <p className="mt-0.5 text-sm text-gray-500 dark:text-slate-400">
            Thuộc: <Link href={`/smart-homes/${home.id}`} className="text-brand hover:brightness-90">{home.name}</Link>
          </p>
        )}
      </div>

      <div className="overflow-hidden rounded-md border border-[#E5EAF0] dark:border-slate-700 bg-white dark:bg-slate-800">
        <div className="grid divide-y divide-gray-100 dark:divide-slate-700 sm:grid-cols-2 xl:grid-cols-4 sm:divide-x sm:divide-y-0">
          <InfoCell label="RSSI" icon={<Radio size={14} />}>{gateway.rssi === 0 ? "—" : `${gateway.rssi} dBm`}</InfoCell>
          <InfoCell label="Firmware" icon={<HardDrive size={14} />}>v{gateway.firmware_version}</InfoCell>
          <InfoCell label="WiFi SSID" icon={<Wifi size={14} />}>{gateway.wifi_ssid}</InfoCell>
          <InfoCell label="MQTT"><StatusBadge status={gateway.mqtt_status} /></InfoCell>
        </div>
        <div className="grid divide-y divide-gray-100 dark:divide-slate-700 border-t border-gray-100 dark:border-slate-700 sm:grid-cols-2 xl:grid-cols-4 sm:divide-x sm:divide-y-0">
          <InfoCell label="Last Seen" icon={<Clock size={14} />}>
            {gateway.last_seen ? new Date(gateway.last_seen).toLocaleTimeString("vi-VN") : "—"}
          </InfoCell>
          <InfoCell label="Provision" icon={<QrCode size={14} />}><StatusBadge status={gateway.provision_status} /></InfoCell>
          <InfoCell label="Pair Status" icon={<Link2 size={14} />}>{gateway.paired_count}/{gateway.node_count} paired</InfoCell>
          <InfoCell label="Node Count" icon={<Layers size={14} />}>{gateway.node_count}</InfoCell>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Link href="/ota" className="inline-flex items-center gap-1.5 rounded border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-3.5 py-1.5 text-sm font-medium text-gray-700 dark:text-slate-300 transition hover:bg-gray-50 dark:hover:bg-slate-700">
          <UploadCloud className="h-3.5 w-3.5" /> OTA cho Gateway này
        </Link>
        <button type="button" onClick={() => setPending("restart")}
          className="inline-flex items-center gap-1.5 rounded border border-warning/30 bg-warning-soft px-3.5 py-1.5 text-sm font-medium text-warning transition hover:brightness-95">
          <RotateCcw className="h-3.5 w-3.5" /> Restart
        </button>
        <button type="button" onClick={() => setPending("reset")}
          className="inline-flex items-center gap-1.5 rounded border border-critical/20 bg-critical-soft px-3.5 py-1.5 text-sm font-medium text-critical transition hover:brightness-95">
          <Power className="h-3.5 w-3.5" /> Factory Reset
        </button>
      </div>

      <div className="overflow-hidden rounded-md border border-[#E5EAF0] dark:border-slate-700 bg-white dark:bg-slate-800">
        <div className="border-b border-gray-100 dark:border-slate-700 bg-[#F4F5F7] dark:bg-slate-900 px-4 py-2">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-500 dark:text-slate-400">Provision Log</p>
        </div>
        {provisionLogs.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-gray-400 dark:text-slate-500">Chưa có log provision nào.</p>
        ) : (
          <ul className="divide-y divide-gray-100 dark:divide-slate-700">
            {provisionLogs.map((l) => (
              <li key={l.id} className="px-4 py-2.5 text-sm text-gray-600 dark:text-slate-300">{l.message}</li>
            ))}
          </ul>
        )}
      </div>

      <ConfirmDialog
        open={!!pending}
        title={pending === "restart" ? "Restart Gateway" : "Factory Reset Gateway"}
        description={pending === "restart"
          ? "Gateway sẽ khởi động lại và mất kết nối tạm thời. Tiếp tục?"
          : "Factory Reset sẽ xoá toàn bộ cấu hình đã ghép nối trên Gateway này. Hành động này không thể hoàn tác."}
        confirmLabel={pending === "restart" ? "Restart" : "Factory Reset"}
        danger={pending === "reset"}
        onConfirm={handleConfirm}
        onCancel={() => setPending(null)}
      />
    </div>
  );
}
