"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Ban, Thermometer, WifiOff } from "lucide-react";
import { Skeleton, StatusBadge, Switch, InlineEdit, ErrorPanel } from "@shh/ui";
import { FetchError } from "@shh/api-client";
import { relativeTime, lastSeenText, parseRouteId, formatTemperature } from "@shh/utils";
import { useRevalidate, deviceKey, overviewKey, roomsPrefix, portalErrorMessage } from "@shh/api-client/portal";
import { renameDevice, useDevice } from "../../api/portalDevices.api";
import { permissionsFor } from "@shh/auth";
import DeviceIcon, { CATEGORY_LABELS } from "../../ui/DeviceIcon";
import DeviceReading from "../../ui/DeviceReading";
import OpenCloseButtons from "../../ui/OpenCloseButtons";
import { useDevicePower } from "../../api/useDevicePower";
import AcControlPanel from "../../ui/AcControlPanel";
import { useAcLearn } from "../../api/useAcLearn";
import { APPLIANCE_TEXT, applianceKind, isAirConditioner } from "../../model/appliance";

// Đường dẫn /devices/abc không phải số → coi như không tìm thấy, không gọi API.
const NOT_FOUND = new FetchError(404, { error: "NOT_FOUND" });

const BackLink = () => (
  <Link
    href="/devices"
    className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200"
  >
    <ArrowLeft className="h-4 w-4" /> Tất cả thiết bị
  </Link>
);

type HomeDeviceDetailPageProps = {
  /** Biểu đồ của cảm biến nhiệt/ẩm — app ghép từ @shh/telemetry (`HomeDeviceTelemetry`). */
  renderTelemetry?: (props: { deviceId: number; deviceName: string }) => React.ReactNode;
  /** Camera — app ghép `HomeCameraLive` (xem trực tiếp) + `HomeCameraSnapshots` (ảnh chụp); cùng module, feature khác nên đi qua slot. */
  renderCamera?: (props: { deviceId: number; deviceName: string }) => React.ReactNode;
};

// GET /devices/:id (polling 5 s); lịch sử số đo của cảm biến do slot `renderTelemetry` hiển thị.
export default function DeviceDetailPage({ renderTelemetry, renderCamera }: HomeDeviceDetailPageProps) {
  const params = useParams<{ id: string }>();
  const deviceId = parseRouteId(params.id);
  const { data, error, mutate } = useDevice(deviceId);
  const revalidate = useRevalidate();
  const power = useDevicePower({ homeSuspended: data?.home.status === "suspended" });
  const acLearn = useAcLearn();

  if (deviceId === null) {
    return (
      <div className="space-y-3">
        <BackLink />
        <ErrorPanel error={NOT_FOUND} />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="space-y-3">
        <BackLink />
        {error ? <ErrorPanel error={error} onRetry={() => mutate()} /> : <Skeleton className="h-32 w-full" />}
      </div>
    );
  }

  const { device, room, home, role } = data;
  const perms = permissionsFor(role);
  const isRelay = device.category === "relay" && device.power !== null;
  const on = power.powerOf(device) === true;
  const blockedReason = power.blockReason(device);
  const kind = applianceKind(device);
  // Điều hòa backend đã gán (appliance "ac") → bảng điều khiển chi tiết thay cho công tắc đơn.
  const acPanel = kind === "ac" && isAirConditioner(device);
  const words = APPLIANCE_TEXT[kind ?? "switch"];
  const categoryLabel = kind ? words.label : CATEGORY_LABELS[device.category];

  async function rename(name: string): Promise<string | null> {
    try {
      await renameDevice(device.id, name);
      await revalidate(deviceKey(device.id), overviewKey(device.home_id), roomsPrefix);
      return null;
    } catch (err) {
      return portalErrorMessage(err);
    }
  }

  return (
    <div className="w-full space-y-4">
      <BackLink />

      <div className="rounded-md border border-[#E5EAF0] dark:border-slate-700 bg-white dark:bg-slate-800 p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <div
              className={`flex h-12 w-12 shrink-0 items-center justify-center rounded ${
                on ? "bg-brand text-white" : "bg-gray-100 dark:bg-slate-700 text-gray-500 dark:text-slate-400"
              }`}
            >
              <DeviceIcon device={device} className="h-6 w-6" />
            </div>
            <div className="min-w-0">
              <div role="heading" aria-level={1}>
                <InlineEdit
                  value={device.device_name}
                  label="Đổi tên thiết bị"
                  canEdit={perms.canRename}
                  maxLength={128}
                  onSave={rename}
                  textClassName="text-lg font-semibold text-gray-900 dark:text-slate-100"
                />
              </div>
              <p className="text-sm text-gray-500 dark:text-slate-400">
                {room?.name ?? "Chưa gán phòng"} · {home.name}
              </p>
              <p className="text-xs text-gray-400 dark:text-slate-500">
                {categoryLabel} · Mã thiết bị {device.device_uid}
              </p>
            </div>
          </div>
          {device.status === "blocked" ? (
            <StatusBadge status="blocked" label="Đã bị khoá" />
          ) : (
            <StatusBadge status={device.online ? "online" : "offline"} />
          )}
        </div>

        {device.status === "blocked" ? (
          <p role="status" className="mt-4 flex items-center gap-2 rounded border border-critical/30 bg-critical-soft px-3 py-2 text-sm text-critical">
            <Ban className="h-4 w-4 shrink-0" />
            Thiết bị đã bị khoá vì lý do bảo mật nên không nhận lệnh. Vui lòng liên hệ bộ phận hỗ trợ để được kiểm tra.
          </p>
        ) : (
          !device.online && (
            <p role="status" className="mt-4 flex items-center gap-2 rounded bg-gray-50 dark:bg-slate-900 px-3 py-2 text-sm text-gray-600 dark:text-slate-300">
              <WifiOff className="h-4 w-4 shrink-0" />
              Thiết bị đang offline — {lastSeenText(device.last_seen)}. Kiểm tra nguồn điện và kết nối WiFi của thiết bị.
            </p>
          )
        )}

        {isRelay && !acPanel && (
          <div className="mt-5 flex items-center justify-between gap-4 rounded border border-gray-100 dark:border-slate-700 px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-gray-900 dark:text-slate-100">{on ? words.on : words.off}</p>
              <p className="text-xs text-gray-400 dark:text-slate-500">
                {power.isPending(device)
                  ? "Đang chờ thiết bị xác nhận…"
                  : (blockedReason ?? (kind === "curtain" ? "Bấm Mở hoặc Đóng để điều khiển rèm" : "Bấm công tắc để bật/tắt"))}
              </p>
            </div>
            {kind === "curtain" ? (
              <OpenCloseButtons device={device} power={power} size="lg" />
            ) : (
              <Switch
                checked={on}
                disabled={!power.canToggle(device)}
                onChange={() => power.toggle(device)}
                label={`${on ? words.turnOff : words.turnOn} ${device.device_name}`}
              />
            )}
          </div>
        )}

        {kind === "ac" && (
          // Nhiệt độ đặt, mã IR đã học và học mã: AcControlPanel (lệnh set_temp / learn_code đi qua Node bằng IR).
          <>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div className="rounded border border-gray-100 dark:border-slate-700 px-4 py-3">
                <p className="text-xs text-gray-400 dark:text-slate-500">Nhiệt độ phòng</p>
                <p className="mt-1 inline-flex items-center gap-1.5 text-base font-semibold text-gray-900 dark:text-slate-100">
                  <Thermometer className="h-4 w-4 text-critical" />
                  {room?.has_climate_data ? formatTemperature(room.temperature) : "Chưa có số đo"}
                </p>
              </div>
              {!acPanel && (
                <div className="rounded border border-dashed border-gray-200 dark:border-slate-700 px-4 py-3">
                  <p className="text-xs text-gray-400 dark:text-slate-500">Nhiệt độ đặt</p>
                  <p className="mt-1 text-sm text-gray-500 dark:text-slate-400">
                    Thiết bị này chưa được khai báo là điều hòa nên chỉ bật/tắt được.
                  </p>
                </div>
              )}
            </div>
            {acPanel && <AcControlPanel device={device} power={power} learn={acLearn} />}
          </>
        )}

        {!isRelay && !acPanel && (
          <div className="mt-5 rounded border border-gray-100 dark:border-slate-700 px-4 py-3">
            <DeviceReading device={device} size="lg" />
            {device.category === "camera" ? (
              <p className="mt-1 text-xs text-gray-400 dark:text-slate-500">
                Bấm “Xem trực tiếp” bên dưới để xem hình camera ngay trên web; các ảnh đã chụp nằm ở khối “Ảnh camera”.
              </p>
            ) : (
              device.latest?.received_at && (
                <p className="mt-1 text-xs text-gray-400 dark:text-slate-500">
                  Số đo cập nhật {relativeTime(device.latest.received_at).toLowerCase()}
                </p>
              )
            )}
          </div>
        )}
      </div>

      {/* Chỉ cảm biến nhiệt/ẩm mới có lịch sử; relay / cửa / camera không gọi telemetry. */}
      {device.category === "sensor" && renderTelemetry?.({ deviceId: device.id, deviceName: device.device_name })}
      {device.category === "camera" && renderCamera?.({ deviceId: device.id, deviceName: device.device_name })}
    </div>
  );
}
