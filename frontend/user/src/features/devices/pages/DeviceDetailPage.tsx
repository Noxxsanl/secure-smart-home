"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Ban, WifiOff } from "lucide-react";
import Skeleton from "@smarthome/shared/ui/Skeleton";
import StatusBadge from "@smarthome/shared/ui/StatusBadge";
import Switch from "@smarthome/shared/ui/Switch";
import InlineEdit from "@smarthome/shared/ui/InlineEdit";
import TelemetryChart from "@smarthome/shared/ui/TelemetryChart";
import { FetchError } from "@smarthome/shared/api/errors";
import { relativeTime } from "@smarthome/shared/lib/time";
import { useRevalidate } from "@/lib/api/client";
import { deviceKey, renameDevice, useDevice, useTelemetry } from "@/lib/api/devices";
import { overviewKey } from "@/lib/api/homes";
import { roomsPrefix } from "@/lib/api/rooms";
import type { TelemetryRange } from "@/lib/api/types";
import { portalErrorMessage } from "@/lib/errors";
import { lastSeenText } from "@/lib/format";
import { permissionsFor } from "@/lib/roles";
import { parseRouteId } from "@/lib/route";
import ErrorPanel from "@/widgets/ErrorPanel";
import DeviceIcon, { CATEGORY_LABELS } from "@/features/devices/components/DeviceIcon";
import DeviceReading from "@/features/devices/components/DeviceReading";
import { useDevicePower } from "@/features/devices/hooks/useDevicePower";

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

// GET /devices/:id (polling 5 s) + GET /devices/:id/telemetry?range=24h|7d cho cảm biến nhiệt/ẩm.
export default function DeviceDetailPage() {
  const params = useParams<{ id: string }>();
  const deviceId = parseRouteId(params.id);
  const { data, error, mutate } = useDevice(deviceId);
  const revalidate = useRevalidate();
  const power = useDevicePower({ homeSuspended: data?.home.status === "suspended" });
  const [range, setRange] = useState<TelemetryRange>("24h");

  // Chỉ cảm biến nhiệt/ẩm mới có lịch sử; relay / cửa / camera không gọi telemetry.
  const isSensor = data?.device.category === "sensor";
  const { data: telemetryData, error: telemetryError } = useTelemetry(isSensor ? deviceId : null, range);
  // keepPreviousData giữ số liệu của khoảng cũ khi đổi 24h ↔ 7d — chỉ vẽ khi đúng khoảng đang chọn.
  const telemetry = telemetryData?.range === range ? telemetryData : undefined;

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
                {CATEGORY_LABELS[device.category]} · Mã thiết bị {device.device_uid}
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

        {isRelay && (
          <div className="mt-5 flex items-center justify-between gap-4 rounded border border-gray-100 dark:border-slate-700 px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-gray-900 dark:text-slate-100">{on ? "Đang bật" : "Đang tắt"}</p>
              <p className="text-xs text-gray-400 dark:text-slate-500">
                {power.isPending(device) ? "Đang chờ thiết bị xác nhận…" : (blockedReason ?? "Bấm công tắc để bật/tắt")}
              </p>
            </div>
            <Switch
              checked={on}
              disabled={!power.canToggle(device)}
              onChange={() => power.toggle(device)}
              label={`${on ? "Tắt" : "Bật"} ${device.device_name}`}
            />
          </div>
        )}

        {!isRelay && (
          <div className="mt-5 rounded border border-gray-100 dark:border-slate-700 px-4 py-3">
            <DeviceReading device={device} size="lg" />
            {device.category === "camera" ? (
              <p className="mt-1 text-xs text-gray-400 dark:text-slate-500">
                Camera đã được ghép vào nhà. Xem trực tiếp sẽ có trong phiên bản sau.
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

      {isSensor && (
        <TelemetryChart
          points={telemetry?.points ?? []}
          range={range}
          onRangeChange={setRange}
          isLoading={!telemetry && !telemetryError}
          errorMessage={!telemetry && telemetryError ? portalErrorMessage(telemetryError) : null}
          title={device.device_name}
        />
      )}
    </div>
  );
}
