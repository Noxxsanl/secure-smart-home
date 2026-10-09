// Nghiệp vụ thiết bị trên console (CONTRACT_V2 §5 Devices): danh sách theo phạm vi Operator, chi tiết,
// telemetry (cần grant với nhà đã claim), đổi trạng thái, gán nhà/phòng, xoá (ADMIN).
import type { RequestMeta } from "../../../lib/clientIp";
import { HttpError, notFound } from "../../../lib/http";
import { eventBus } from "../../../lib/eventBus";
import type { DeviceStatus } from "../../../types/domain";
import { auditOperatorHomeViewed, requireOperatorHomeAccess } from "../../access/access.service";
import type { AuthContext } from "../../auth/auth.types";
import { getDeviceRow, getTelemetrySeries, toConsoleDevice, toDeviceStateEvent } from "../../devices/deviceReadModel";
import type { DeviceRow, TelemetryRange, TelemetrySeries } from "../../devices/devices.types";
import { getHomeRow, getRoomRow } from "../../homes/homes.repository";
import { logEvent } from "../../logs/logEvent";
import { notifyStaff } from "../../notifications/notification.service";
import { canSeeCustomerData, loadStaffScope, requireAdmin } from "../common/staff";
import type { ConsoleDevice } from "../dashboard.types";
import {
  deleteDeviceRow,
  findHomeGatewayId,
  listDevices,
  listRecentCommands,
  updateDeviceFields,
  updateDeviceStatus,
  type DeviceListFilter,
  type DevicePatch,
} from "./devices.repository";

async function requireDevice(id: number): Promise<DeviceRow> {
  const row = await getDeviceRow(id);
  if (!row) throw notFound("Device not found");
  return row;
}

/** Operator + nhà đã claim + chưa có grant → 403 ACCESS_GRANT_REQUIRED (thiết bị chưa gán nhà: bỏ qua). */
async function ensureHomeAccess(auth: AuthContext, home: { id: number | null; status: string | null }) {
  if (home.id === null || home.status === null) return { restricted: false, grant: null };
  return requireOperatorHomeAccess(auth, { id: home.id, status: home.status as "unclaimed" | "active" | "suspended" });
}

export async function listConsoleDevices(auth: AuthContext, filter: DeviceListFilter): Promise<ConsoleDevice[]> {
  const [rows, scope] = await Promise.all([listDevices(filter), loadStaffScope(auth)]);
  // Trạng thái bật/tắt relay của nhà đã claim là dữ liệu khách: che khi Operator chưa có grant
  return rows.map((row) => {
    const dto = toConsoleDevice(row);
    return canSeeCustomerData(scope, { id: row.home_id, status: row.home_status }) ? dto : { ...dto, power: null };
  });
}

export async function getConsoleDeviceDetail(auth: AuthContext, id: number) {
  const row = await requireDevice(id);
  const scope = await loadStaffScope(auth);
  const visible = canSeeCustomerData(scope, { id: row.home_id, status: row.home_status });
  const dto = toConsoleDevice(row);
  return {
    device: visible ? dto : { ...dto, power: null },
    // Lịch sử lệnh là hoạt động của khách → chỉ khi được phép xem dữ liệu nhà
    recent_commands: visible ? await listRecentCommands(id, 20) : [],
  };
}

export async function getDeviceTelemetry(
  auth: AuthContext,
  id: number,
  range: TelemetryRange,
  meta: RequestMeta
): Promise<TelemetrySeries> {
  const row = await requireDevice(id);
  const access = await ensureHomeAccess(auth, { id: row.home_id, status: row.home_status });
  if (row.home_id !== null && row.home_name !== null) {
    await auditOperatorHomeViewed(auth, { id: row.home_id, name: row.home_name }, access.grant, "số liệu thiết bị", meta);
  }
  return getTelemetrySeries(id, range);
}

export async function setDeviceStatus(auth: AuthContext, id: number, status: DeviceStatus, meta: RequestMeta): Promise<ConsoleDevice> {
  const row = await requireDevice(id);
  // Chặn/mở khoá thiết bị của nhà đã claim là thao tác trên tài sản khách → Operator cần grant (ADMIN không bị hạn chế)
  await ensureHomeAccess(auth, { id: row.home_id, status: row.home_status });
  await updateDeviceStatus(id, status);

  await logEvent({
    eventType: "DEVICE_STATUS_CHANGE",
    deviceId: id,
    actorUserId: auth.userId,
    message: `${auth.username} đổi trạng thái thiết bị ${row.device_id} thành ${status}`,
    ip: meta.ip,
    userAgent: meta.userAgent,
    details: { device_uid: row.device_id, from: row.status, to: status },
  });

  // Như route cũ: thao tác của Operator được báo cho ADMIN
  if (auth.role === "operator") {
    const titles: Record<DeviceStatus, [string, string]> = {
      blocked: ["Thiết bị bị chặn", `Operator ${auth.username} đã chặn thiết bị ${row.device_id}`],
      active: ["Thiết bị được mở khoá", `Operator ${auth.username} đã bỏ chặn thiết bị ${row.device_id}`],
      inactive: ["Thiết bị bị vô hiệu hoá", `Operator ${auth.username} đã vô hiệu hoá thiết bị ${row.device_id}`],
    };
    const [title, message] = titles[status];
    await notifyStaff({
      targetRole: "admin",
      type: status === "blocked" ? "DEVICE_BLOCKED" : "DEVICE_STATUS_CHANGE",
      title,
      message,
      severity: status === "blocked" ? "warning" : "info",
      homeId: row.home_id,
      relatedDeviceId: id,
      actor: { id: auth.userId, username: auth.username, role: auth.role },
    });
  }

  const updated = await requireDevice(id);
  const event = toDeviceStateEvent(updated);
  if (event) eventBus.emit("device_state", event);
  return toConsoleDevice(updated);
}

export async function assignDevice(
  auth: AuthContext,
  id: number,
  input: { deviceName?: string; homeId?: number | null; roomId?: number | null },
  meta: RequestMeta
): Promise<ConsoleDevice> {
  const row = await requireDevice(id);
  // Nhà hiện tại đã claim → cần grant mới được đổi thiết bị đang thuộc nhà đó
  await ensureHomeAccess(auth, { id: row.home_id, status: row.home_status });

  const homeChanged = input.homeId !== undefined && input.homeId !== row.home_id;
  const targetHomeId = input.homeId === undefined ? row.home_id : input.homeId;
  if (homeChanged && targetHomeId !== null) {
    const target = await getHomeRow(targetHomeId);
    if (!target) throw new HttpError(404, "HOME_NOT_FOUND", "Target home not found");
    await ensureHomeAccess(auth, { id: target.id, status: target.status });
    if (row.device_type === "gateway") {
      const existing = await findHomeGatewayId(targetHomeId);
      if (existing !== null && existing !== row.id) {
        throw new HttpError(409, "HOME_HAS_GATEWAY", "Target home already has a gateway");
      }
    }
  }

  // Đổi nhà mà không chỉ định phòng → bỏ phòng cũ (phòng thuộc nhà cũ)
  const targetRoomId = homeChanged ? (input.roomId ?? null) : input.roomId === undefined ? row.room_id : input.roomId;
  if (targetRoomId !== null) {
    if (targetHomeId === null) throw new HttpError(400, "INVALID_INPUT", "room_id requires the device to be assigned to a home");
    if (row.device_type === "gateway") throw new HttpError(400, "INVALID_INPUT", "A gateway cannot be placed in a room");
    const room = await getRoomRow(targetRoomId);
    if (!room || room.home_id !== targetHomeId) {
      throw new HttpError(400, "ROOM_NOT_IN_HOME", "Room does not belong to the target home");
    }
  }

  const patch: DevicePatch = { deviceName: input.deviceName };
  if (homeChanged) {
    patch.homeId = targetHomeId;
    patch.roomId = targetRoomId;
    // Node theo gateway của nhà mới (null nếu nhà chưa có / bỏ gán); gateway không có cha
    if (row.device_type !== "gateway") patch.gatewayDeviceId = targetHomeId === null ? null : await findHomeGatewayId(targetHomeId);
  } else if (input.roomId !== undefined) {
    patch.roomId = targetRoomId;
  }
  await updateDeviceFields(id, patch);

  const renamed = input.deviceName !== undefined && input.deviceName !== row.device_name;
  const moved = homeChanged || targetRoomId !== row.room_id;
  if (moved) {
    await logEvent({
      eventType: "DEVICE_ASSIGNED",
      deviceId: id,
      homeId: targetHomeId,
      actorUserId: auth.userId,
      message: targetHomeId === null
        ? `${auth.username} bỏ gán thiết bị ${row.device_id} khỏi nhà`
        : `${auth.username} gán thiết bị ${row.device_id} vào nhà #${targetHomeId}`,
      ip: meta.ip,
      userAgent: meta.userAgent,
      details: { from_home_id: row.home_id, to_home_id: targetHomeId, room_id: targetRoomId },
    });
  }
  if (renamed) {
    await logEvent({
      eventType: "DEVICE_RENAMED",
      deviceId: id,
      actorUserId: auth.userId,
      message: `${auth.username} đổi tên thiết bị ${row.device_id} thành "${input.deviceName}"`,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
  }
  // Client khách tải lại nhà cũ và nhà mới
  if (row.home_id !== null) eventBus.emit("home_changed", { home_id: row.home_id });
  if (targetHomeId !== null && targetHomeId !== row.home_id) eventBus.emit("home_changed", { home_id: targetHomeId });

  return toConsoleDevice(await requireDevice(id));
}

export async function removeDevice(auth: AuthContext, id: number, meta: RequestMeta): Promise<void> {
  requireAdmin(auth);
  const row = await requireDevice(id);
  await deleteDeviceRow(id);
  await logEvent({
    eventType: "DEVICE_DELETE",
    homeId: row.home_id,
    actorUserId: auth.userId,
    message: `${auth.username} xoá thiết bị ${row.device_id} (${row.device_name})`,
    ip: meta.ip,
    userAgent: meta.userAgent,
    details: { device_uid: row.device_id, category: row.category },
  });
  if (row.home_id !== null) eventBus.emit("home_changed", { home_id: row.home_id });
}
