"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  Lock, Unlock, Power, Trash2, MapPin, Hash, Activity, ArrowLeft, Home as HomeIcon,
  FlaskConical, Server, Cpu, HardDrive, Globe,
} from "lucide-react";
import {
  OnlineIndicator, InfoCell, ConfirmModal, Panel, PanelEmpty, LoadErrorBar, PageError, PageLoading, StatusBadge, useToast, BTN_DANGER_SOFT, BTN_SECONDARY, BTN_SUCCESS_SOFT, BTN_WARNING_SOFT, CARD, CARD_HEADER, MUTED_DASH, TABLE_HEAD_ROW, TH, TR,
} from "@shh/ui";
import SimulatorControls from "../../ui/SimulatorControls";
import { useSimulatorControls } from "../../api/useSimulatorControls";
import AssignDeviceDialog from "./AssignDeviceDialog";
import { useDeviceDetail } from "../../api/useDeviceDetail";
import { usePermissions } from "@shh/auth";
import { deleteDevice, revalidateDeviceData, updateDeviceStatus } from "../../api/devices.api";
import { CATEGORY_LABELS, COMMAND_CHANNEL_LABELS, COMMAND_LABELS, COMMAND_SOURCE_LABELS, COMMAND_STATUS_LABELS } from "@shh/api-client/dashboard";
import { parseRouteId, formatDateTime, formatRelative } from "@shh/utils";
import type { ConsoleDevice, DeviceCommandRecord, DeviceCommandStatus } from "@shh/api-client/dashboard";

type PendingAction = "lock" | "unlock" | "activate" | "delete";

/** Props mà trang truyền cho khối số đo (`DeviceTelemetryPanel` của @shh/telemetry). */
export type DeviceTelemetrySlotProps = {
  deviceId: number;
  deviceName: string;
  category: ConsoleDevice["category"];
  homeId: ConsoleDevice["home_id"];
};

type DeviceDetailPageProps = {
  /** Khối số đo/trạng thái cảm biến — app ghép từ @shh/telemetry. */
  renderTelemetry?: (props: DeviceTelemetrySlotProps) => React.ReactNode;
};

const COMMAND_BADGE: Record<DeviceCommandStatus, string> = {
  pending: "pending",
  sent: "in_progress",
  acked: "active",
  failed: "blocked",
  timeout: "blocked",
};

export default function DeviceDetailPage({ renderTelemetry }: DeviceDetailPageProps) {
  const { id } = useParams<{ id: string }>();
  const { device, recentCommands, isLoading, error, refresh } = useDeviceDetail(parseRouteId(id));

  if (!device) {
    if (!error || isLoading) return <PageLoading label="Đang tải thiết bị…" />;
    return (
      <PageError
        error={error}
        backHref="/devices"
        backLabel="Trở về Devices"
        notFoundText="Không tìm thấy thiết bị này."
        onRetry={() => void refresh()}
      />
    );
  }
  return (
    <DeviceDetailView
      device={device}
      recentCommands={recentCommands}
      loadError={error}
      refresh={refresh}
      renderTelemetry={renderTelemetry}
    />
  );
}


function DeviceDetailView({
  device, recentCommands, loadError, refresh, renderTelemetry,
}: {
  device: ConsoleDevice;
  recentCommands: DeviceCommandRecord[];
  loadError: unknown;
  refresh: () => Promise<unknown>;
} & DeviceDetailPageProps) {
  const router = useRouter();
  const perms = usePermissions();
  const { showToast } = useToast();
  const sim = useSimulatorControls(device.id, () => void revalidateDeviceData());
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [assignOpen, setAssignOpen] = useState(false);

  const isGateway = device.category === "gateway";
  const isRelay = device.category === "relay";

  const dialog: Record<PendingAction, { title: string; confirm: string; danger: boolean; text: string }> = {
    delete: {
      title: "Xoá thiết bị", confirm: "Xoá", danger: true,
      text: `Xoá vĩnh viễn “${device.device_name}”? Thiết bị phải đăng ký lại nếu muốn dùng tiếp. Hành động không hoàn tác được.`,
    },
    lock: {
      title: "Khoá thiết bị", confirm: "Khoá", danger: true,
      text: `Khoá “${device.device_name}”? Dữ liệu và lệnh từ thiết bị này sẽ bị từ chối cho tới khi mở khoá.`,
    },
    unlock: {
      title: "Mở khoá thiết bị", confirm: "Mở khoá", danger: false,
      text: `Mở khoá “${device.device_name}”? Bộ đếm lỗi xác thực của thiết bị sẽ được đặt lại.`,
    },
    activate: {
      title: "Kích hoạt thiết bị", confirm: "Kích hoạt", danger: false,
      text: `Kích hoạt “${device.device_name}”? Thiết bị sẽ được phép gửi dữ liệu.`,
    },
  };

  async function runAction(action: PendingAction) {
    if (action === "delete") {
      await deleteDevice(device.id);
      showToast(`Đã xoá “${device.device_name}”.`);
      router.push("/devices");
      void revalidateDeviceData();
      return;
    }
    await updateDeviceStatus(device.id, action === "lock" ? "blocked" : "active");
    await revalidateDeviceData();
    showToast(action === "lock" ? "Đã khoá thiết bị." : action === "unlock" ? "Đã mở khoá thiết bị." : "Đã kích hoạt thiết bị.");
  }

  return (
    <div className="w-full space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2.5">
          <Link href="/devices" className={BTN_SECONDARY}>
            <ArrowLeft className="h-3.5 w-3.5" /> Trở về Devices
          </Link>

          {device.home_id && device.home_name && (
            <div className="flex items-center gap-1.5 text-xs text-gray-400 dark:text-slate-500">
              <HomeIcon size={12} />
              <Link href={`/smart-homes/${device.home_id}`} className="hover:text-brand">{device.home_name}</Link>
              {device.room_name && <span>/ {device.room_name}</span>}
            </div>
          )}

          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded bg-gray-100 dark:bg-slate-700">
              <Hash className="h-4 w-4 text-gray-500 dark:text-slate-400" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2.5">
                <h1 className="text-lg font-semibold text-gray-900 dark:text-slate-100">{device.device_name}</h1>
                <StatusBadge status={device.status} />
                {device.is_simulated && (
                  <span className="inline-flex items-center gap-1 rounded bg-gray-100 dark:bg-slate-700 px-1.5 py-0.5 text-[10px] font-semibold text-gray-500 dark:text-slate-400">
                    <FlaskConical size={10} /> Mô phỏng
                  </span>
                )}
              </div>
              <p className="mt-0.5 font-mono text-xs text-gray-400 dark:text-slate-500">{device.device_uid}</p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {isGateway && (
            <Link href={`/gateways/${device.id}`} className={BTN_SECONDARY}>
              <Server className="h-3.5 w-3.5" /> Trang Gateway
            </Link>
          )}
          {perms.canAssignDevice && (
            <button type="button" onClick={() => setAssignOpen(true)} className={BTN_SECONDARY}>
              <HomeIcon className="h-3.5 w-3.5" /> Gán vào nhà/phòng
            </button>
          )}
          {perms.canUpdateDeviceStatus && (
            device.status === "inactive" ? (
              <button type="button" onClick={() => setPending("activate")} className={BTN_SUCCESS_SOFT}>
                <Power className="h-3.5 w-3.5" /> Kích hoạt
              </button>
            ) : device.status === "blocked" ? (
              <button type="button" onClick={() => setPending("unlock")} className={BTN_SUCCESS_SOFT}>
                <Unlock className="h-3.5 w-3.5" /> Mở khoá
              </button>
            ) : (
              <button type="button" onClick={() => setPending("lock")} className={BTN_WARNING_SOFT}>
                <Lock className="h-3.5 w-3.5" /> Khoá
              </button>
            )
          )}
          {perms.canDeleteDevice && (
            <button type="button" onClick={() => setPending("delete")} className={BTN_DANGER_SOFT}>
              <Trash2 className="h-3.5 w-3.5" /> Xoá
            </button>
          )}
        </div>
      </div>

      {!!loadError && <LoadErrorBar error={loadError} onRetry={() => void refresh()} />}

      <div className={`overflow-hidden ${CARD}`}>
        <div className={CARD_HEADER}>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-500 dark:text-slate-400">Thông tin thiết bị</p>
        </div>
        <div className="grid divide-y divide-gray-100 dark:divide-slate-700 sm:grid-cols-2 xl:grid-cols-4 sm:divide-x sm:divide-y-0">
          <InfoCell label="Loại">{CATEGORY_LABELS[device.category]}</InfoCell>
          <InfoCell label="Trạng thái"><StatusBadge status={device.status} /></InfoCell>
          <InfoCell label="Kết nối"><OnlineIndicator online={device.online} /></InfoCell>
          <InfoCell label="Hoạt động gần nhất">
            <span title={device.last_seen ? formatDateTime(device.last_seen) : undefined}>{formatRelative(device.last_seen)}</span>
          </InfoCell>
        </div>
        <div className="grid divide-y divide-gray-100 dark:divide-slate-700 border-t border-gray-100 dark:border-slate-700 sm:grid-cols-2 xl:grid-cols-4 sm:divide-x sm:divide-y-0">
          <InfoCell label="Vị trí" icon={<MapPin size={14} />}>
            {device.home_name ? `${device.home_name}${device.room_name ? ` / ${device.room_name}` : ""}` : (device.location ?? "Chưa gán nhà")}
          </InfoCell>
          <InfoCell label="Gateway" icon={<Server size={14} />}>
            {device.gateway_id && device.gateway_uid ? (
              <Link href={`/gateways/${device.gateway_id}`} className="font-mono text-xs text-brand hover:brightness-90">{device.gateway_uid}</Link>
            ) : <span className={MUTED_DASH}>—</span>}
          </InfoCell>
          <InfoCell label="Node" icon={<Cpu size={14} />}>
            <span className="font-mono text-xs">{device.node_uid ?? "—"}</span>
          </InfoCell>
          <InfoCell label="Firmware" icon={<HardDrive size={14} />}>
            {device.firmware_version ? `v${device.firmware_version}` : "—"}
          </InfoCell>
        </div>
        <div className="grid divide-y divide-gray-100 dark:divide-slate-700 border-t border-gray-100 dark:border-slate-700 sm:grid-cols-2 xl:grid-cols-4 sm:divide-x sm:divide-y-0">
          <InfoCell label="Mã thiết bị" icon={<Hash size={14} />}>
            <span className="font-mono text-xs">{device.device_uid}</span>
          </InfoCell>
          <InfoCell label="Lỗi xác thực" icon={<Activity size={14} />}>
            <span className={device.fail_count > 0 ? "text-warning" : undefined}>{device.fail_count}</span>
          </InfoCell>
          <InfoCell label="IP gần nhất" icon={<Globe size={14} />}>
            <span className="font-mono text-xs">{device.last_ip ?? "—"}</span>
          </InfoCell>
          {isRelay ? (
            <InfoCell label="Trạng thái relay" icon={<Power size={14} />}>
              {device.power === null ? "—" : device.power ? "Đang bật" : "Đang tắt"}
            </InfoCell>
          ) : (
            <InfoCell label="Đăng ký lúc">{formatDateTime(device.created_at)}</InfoCell>
          )}
        </div>
      </div>

      <SimulatorControls sim={sim} category={device.category} isSimulated={device.is_simulated} simOnline={device.sim_online} />

      {renderTelemetry?.({ deviceId: device.id, deviceName: device.device_name, category: device.category, homeId: device.home_id })}

      {(isRelay || recentCommands.length > 0) && (
        <Panel title="Lệnh gần đây" subtitle="Nhật ký lệnh điều khiển gửi tới thiết bị (Device Command Log).">
          {recentCommands.length === 0 ? (
            <PanelEmpty>Chưa có lệnh nào được gửi tới thiết bị này.</PanelEmpty>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full table-auto text-left text-sm">
                <thead>
                  <tr className={TABLE_HEAD_ROW}>
                    <th className={TH}>Lệnh</th>
                    <th className={TH}>Kết quả</th>
                    <th className={TH}>Nguồn</th>
                    <th className={TH}>Người gửi</th>
                    <th className={TH}>Gửi lúc</th>
                    <th className={TH}>Xác nhận lúc</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                  {recentCommands.map((c) => (
                    <tr key={c.id} className={TR}>
                      <td className="px-4 py-2.5 font-medium text-gray-900 dark:text-slate-100">{COMMAND_LABELS[c.command] ?? "Lệnh khác"}</td>
                      <td className="px-4 py-2.5"><StatusBadge status={COMMAND_BADGE[c.status]} label={COMMAND_STATUS_LABELS[c.status]} /></td>
                      <td className="px-4 py-2.5 text-xs text-gray-500 dark:text-slate-400">
                        {COMMAND_SOURCE_LABELS[c.source]} · {COMMAND_CHANNEL_LABELS[c.channel]}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-gray-500 dark:text-slate-400">{c.issued_by_name ?? <span className={MUTED_DASH}>—</span>}</td>
                      <td className="px-4 py-2.5 font-mono text-xs text-gray-500 dark:text-slate-400">{formatDateTime(c.issued_at)}</td>
                      <td className="px-4 py-2.5 font-mono text-xs text-gray-500 dark:text-slate-400">{c.acked_at ? formatDateTime(c.acked_at) : <span className={MUTED_DASH}>—</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      )}

      {pending && (
        <ConfirmModal
          title={dialog[pending].title}
          subtitle={device.device_uid}
          danger={dialog[pending].danger}
          description={dialog[pending].text}
          confirmLabel={dialog[pending].confirm}
          onConfirm={() => runAction(pending)}
          onClose={() => setPending(null)}
          errorOverrides={{
            ACCESS_GRANT_REQUIRED: "Thiết bị thuộc nhà đã được khách hàng kích hoạt — cần quyền truy cập có thời hạn. Mở trang Smart Home của nhà và bấm “Yêu cầu quyền truy cập”.",
          }}
        />
      )}

      {assignOpen && (
        <AssignDeviceDialog
          device={device}
          onClose={() => setAssignOpen(false)}
          onSaved={() => { void revalidateDeviceData(); showToast("Đã cập nhật vị trí thiết bị."); }}
        />
      )}
    </div>
  );
}
