// Thiết bị phía khách: chi tiết, đổi tên, lệnh bật/tắt, telemetry (CONTRACT §4.2).
// Quyền: requireDeviceAccess (404 nếu không thấy/GUEST không được cấp, 403 nếu thiếu vai trò).
import type { RequestMeta } from "../../../lib/clientIp";
import { runSql } from "../../../lib/db";
import { eventBus } from "../../../lib/eventBus";
import { notFound } from "../../../lib/http";
import { assertHomeWritable } from "../../access/permissions";
import type { AuthContext } from "../../auth/auth.types";
import { requireDeviceAccess } from "../../devices/deviceAccess";
import { sendDeviceCommand, type CommandSummary } from "../../devices/deviceCommand.service";
import { getDeviceRow, getTelemetrySeries, latestReadings } from "../../devices/deviceReadModel";
import type { CustomerDevice, DeviceAction, Reading, TelemetryRange, TelemetrySeries } from "../../devices/devices.types";
import { toHome } from "../../homes/homes.mapper";
import { listRoomSummaries } from "../../homes/homes.repository";
import type { Home, RoomSummary } from "../../homes/homes.types";
import { logEvent } from "../../logs/logEvent";
import type { MemberRole } from "../../../types/domain";
import type { CustomerChannel } from "../customer.types";
import { toCustomerDeviceOne } from "./deviceView";

export async function getDeviceDetail(
  auth: AuthContext,
  deviceId: number
): Promise<{ device: CustomerDevice; room: RoomSummary | null; home: Home; role: MemberRole }> {
  const { device, access } = await requireDeviceAccess(auth, deviceId, "view");
  let room: RoomSummary | null = null;
  if (device.room_id !== null) {
    const [summary] = await listRoomSummaries(access.home.id, {
      withClimate: true,
      roomId: device.room_id,
      deviceIds: access.guestDeviceIds,
    });
    room = summary ?? null;
  }
  return { device: await toCustomerDeviceOne(device, access), room, home: toHome(access.home), role: access.role };
}

export async function renameDevice(auth: AuthContext, deviceId: number, name: string, meta: RequestMeta): Promise<CustomerDevice> {
  const { device, access } = await requireDeviceAccess(auth, deviceId, "rename");
  assertHomeWritable(access.home);
  await runSql("UPDATE devices SET device_name = ? WHERE id = ?", [name, device.id]);
  await logEvent({
    eventType: "DEVICE_RENAMED",
    homeId: device.home_id,
    deviceId: device.id,
    actorUserId: auth.userId,
    message: `${auth.displayName} đổi tên thiết bị "${device.device_name}" thành "${name}"`,
    ip: meta.ip,
    userAgent: meta.userAgent,
  });
  if (device.home_id !== null) eventBus.emit("home_changed", { home_id: device.home_id });
  const fresh = await getDeviceRow(device.id);
  if (!fresh) throw notFound("Device not found");
  return toCustomerDeviceOne(fresh, access);
}

/**
 * Gửi lệnh bật/tắt. Thứ tự: quyền (404/403) → nhà suspended (409) → sendDeviceCommand
 * (400 NOT_CONTROLLABLE, 409 DEVICE_BLOCKED/DEVICE_OFFLINE, 504 TIMEOUT). Kênh quyết định nguồn behaviour log.
 */
export async function commandDevice(
  auth: AuthContext,
  deviceId: number,
  action: DeviceAction,
  channel: CustomerChannel,
  meta: RequestMeta
): Promise<{ command: CommandSummary; device: CustomerDevice }> {
  const { device, access } = await requireDeviceAccess(auth, deviceId, "control_device");
  assertHomeWritable(access.home);
  const result = await sendDeviceCommand({
    deviceId: device.id,
    action,
    issuedBy: auth.userId,
    source: "user",
    channel,
    meta,
  });
  return { command: result.command, device: await toCustomerDeviceOne(result.device, access) };
}

export async function getDeviceTelemetry(auth: AuthContext, deviceId: number, range: TelemetryRange): Promise<TelemetrySeries> {
  const { device } = await requireDeviceAccess(auth, deviceId, "view");
  if (device.category === "sensor") return getTelemetrySeries(device.id, range);

  // Thiết bị khác không có chuỗi nhiệt/ẩm; cảm biến cửa vẫn trả số đo mới nhất (door_open)
  let latest: Reading | null = null;
  if (device.category === "door_contact") latest = (await latestReadings([device.id])).get(device.id) ?? null;
  return { device_id: device.id, range, bucket_seconds: range === "24h" ? 300 : 3600, points: [], latest };
}
