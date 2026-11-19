"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Cpu, Droplets, PauseCircle, Thermometer } from "lucide-react";
import { EmptyState, InlineEdit, Skeleton, ErrorPanel } from "@shh/ui";
import { FetchError } from "@shh/api-client";
import { relativeTime, formatHumidity, formatTemperature, parseRouteId } from "@shh/utils";
import { useRevalidate, overviewKey, roomKey, portalErrorMessage } from "@shh/api-client/portal";
import { renameRoom, useRoom } from "../../api/rooms.api";
import { permissionsFor } from "@shh/auth";
import type { RenderDevices } from "../../model/slots";

// Đường dẫn /rooms/abc không phải số → coi như không tìm thấy, không gọi API.
const NOT_FOUND = new FetchError(404, { error: "NOT_FOUND" });

const BackLink = () => (
  <Link
    href="/rooms"
    className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200"
  >
    <ArrowLeft className="h-4 w-4" /> Tất cả phòng
  </Link>
);

// GET /rooms/:id — phòng + thiết bị + vai trò của tôi trong nhà chứa phòng; polling 5 s.
type RoomDetailPageProps = {
  /** Lưới thiết bị của phòng — app ghép `DeviceGrid` của @shh/devices. */
  renderDevices?: RenderDevices;
};

export default function RoomDetailPage({ renderDevices }: RoomDetailPageProps) {
  const params = useParams<{ id: string }>();
  const roomId = parseRouteId(params.id);
  const { data, error, mutate } = useRoom(roomId);
  const revalidate = useRevalidate();

  if (roomId === null) {
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
        {error ? (
          <ErrorPanel error={error} onRetry={() => mutate()} />
        ) : (
          <>
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-40 w-full" />
          </>
        )}
      </div>
    );
  }

  const { room, home, role } = data;
  const perms = permissionsFor(role);
  const devices = data.devices.filter((d) => d.category !== "gateway");

  async function rename(name: string): Promise<string | null> {
    try {
      await renameRoom(room.id, name);
      await revalidate(roomKey(room.id), overviewKey(room.home_id));
      return null;
    } catch (err) {
      return portalErrorMessage(err);
    }
  }

  return (
    <div className="w-full space-y-4">
      <BackLink />

      <div className="rounded-md border border-[#E5EAF0] dark:border-slate-700 bg-white dark:bg-slate-800 p-4">
        <p className="text-xs text-gray-400 dark:text-slate-500">{home.name}</p>
        <div role="heading" aria-level={1} className="mt-0.5">
          <InlineEdit
            value={room.name}
            label="Đổi tên phòng"
            canEdit={perms.canRename}
            maxLength={64}
            onSave={rename}
            textClassName="text-lg font-semibold text-gray-900 dark:text-slate-100"
          />
        </div>
        <div className="mt-3 flex flex-wrap gap-5 text-sm text-gray-700 dark:text-slate-300">
          {room.has_climate_data ? (
            <>
              <span className="inline-flex items-center gap-1.5">
                <Thermometer className="h-4 w-4 text-critical" />
                {formatTemperature(room.temperature)}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Droplets className="h-4 w-4 text-info" />
                Độ ẩm {formatHumidity(room.humidity)}
              </span>
            </>
          ) : (
            <span className="text-gray-400 dark:text-slate-500">Chưa có số đo khí hậu</span>
          )}
          <span className="inline-flex items-center gap-1.5">
            <Cpu className="h-4 w-4 text-gray-400" />
            {room.device_count} thiết bị · {room.online_count} online · {room.on_count} đang bật
          </span>
        </div>
        {room.climate_updated_at && (
          <p className="mt-2 text-[11px] text-gray-400 dark:text-slate-500">
            Số đo cập nhật {relativeTime(room.climate_updated_at).toLowerCase()}
          </p>
        )}
      </div>

      {home.status === "suspended" && (
        <p role="status" className="flex items-start gap-2 rounded-md border border-critical/30 bg-critical-soft px-4 py-3 text-sm text-critical">
          <PauseCircle className="mt-0.5 h-4 w-4 shrink-0" />
          Dịch vụ của nhà này đang tạm ngưng nên chưa điều khiển thiết bị được. Vui lòng liên hệ bộ phận hỗ trợ.
        </p>
      )}

      {devices.length === 0 ? (
        <div className="rounded-md border border-[#E5EAF0] dark:border-slate-700 bg-white dark:bg-slate-800">
          <EmptyState icon={Cpu} title="Phòng chưa có thiết bị" />
        </div>
      ) : (
        renderDevices?.({ devices, homeSuspended: home.status === "suspended", showRoom: false })
      )}
    </div>
  );
}
