// Đổi tên và/hoặc gán thiết bị vào nhà/phòng trên console (CONTRACT_V2 §5 Devices).
import type { RequestMeta } from "../../../../core/http/request-meta";
import type { AuthContext } from "../../../../core/auth/auth-context";
import { HttpError } from "../../../../shared/errors/http-error";
import { eventBus } from "../../../../shared/events/event-bus";
import { getHomeRow, getRoomRow } from "../../../homes";
import { logEvent } from "../../../audit";
import { ensureHomeAccess, requireDevice } from "../../domain/console-access";
import type { ConsoleDevice } from "../../domain/device.types";
import {
  findHomeGatewayId,
  updateDeviceFields,
  type DevicePatch,
} from "../../infrastructure/console-devices.repository";
import { toConsoleDevice } from "../../infrastructure/device.read-model";

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
