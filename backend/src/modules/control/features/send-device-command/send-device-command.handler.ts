// Lệnh bật/tắt relay (CONTRACT_V2 §4.2 commands, §6 Command service, §7 MQTT).
//
//   commandDevice      use case của khách (portal/mobile): quyền (404/403) → nhà suspended (409) → sendDeviceCommand.
//   sendDeviceCommand  bật/tắt một relay, chờ ack ≤ 5 s → { command, device } hoặc ném HttpError.
//                      Cũng được automation engine gọi (qua control.facade).
//
// Chữ ký lệnh/ack là HMAC-SHA256 bằng secret của GATEWAY (CONTRACT §7). secret_key chỉ được SELECT trong module
// devices (getGatewaySigner — chỉ nhận hàm sign/verify); bộ ký giữ ở RAM tối đa 5 s cho tới khi ack về, KHÔNG BAO GIỜ log hay trả ra
// ngoài (invariant 1, 2).
import type { RequestMeta } from "../../../../core/http/request-meta";
import type { AuthContext } from "../../../../core/auth/auth-context";
import { newUuid } from "../../../../shared/crypto";
import { toBool, withTransaction } from "../../../../infrastructure/database/db";
import { eventBus } from "../../../../shared/events/event-bus";
import { HttpError, notFound } from "../../../../shared/errors/http-error";
import { isOnline } from "../../../../shared/time";
import type { CustomerChannel } from "../../../../shared/types/domain";
import { logEvent } from "../../../audit";
import { assertHomeWritable } from "../../../homes";
import {
  getDeviceRow,
  getGatewaySigner,
  requireDeviceAccess,
  setDevicePowerState,
  toCustomerDeviceOne,
  toDeviceStateEvent,
} from "../../../devices";
import type { CustomerDevice, DeviceAction, DeviceRow } from "../../../devices";
import type { BehaviorSource } from "../../domain/behavior.types";
import { gatewayBaseTopic } from "../../domain/command-topics";
import type {
  CommandChannel,
  CommandSource,
  CommandSummary,
  SendDeviceCommandInput,
  SendDeviceCommandResult,
} from "../../domain/command.types";
import { registerPending, type AckOutcome } from "../../domain/pending-acks";
import { getSimulatedHandler, runSimulated } from "../../domain/simulated-command";
import { isCommandBrokerConnected, publishJson } from "../../infrastructure/command-mqtt.client";
import { logBehavior } from "../../infrastructure/behavior-log.repository";
import { insertCommandRow, markCommand, markCommandAcked } from "../../infrastructure/device-command.repository";

function defaultBehaviorSource(source: CommandSource, channel: CommandChannel): BehaviorSource {
  if (source === "automation") return "automation";
  if (source === "operator" || channel === "dashboard") return "dashboard";
  return channel === "mobile" ? "mobile" : "manual";
}

function powerLabel(on: boolean | null): string | null {
  return on === null ? null : on ? "ON" : "OFF";
}

async function runMqttDeviceCommand(device: DeviceRow, action: DeviceAction, commandUuid: string, rowId: number): Promise<AckOutcome> {
  if (device.gateway_device_id === null || device.gateway_uid === null || device.home_id === null) {
    return { kind: "timeout", errorCode: "NO_GATEWAY" };
  }
  const signer = await getGatewaySigner(device.gateway_device_id);
  if (!signer) return { kind: "timeout", errorCode: "NO_GATEWAY" };
  if (!isCommandBrokerConnected()) return { kind: "timeout", errorCode: "BROKER_DOWN" };

  const ts = Math.floor(Date.now() / 1000);
  const payload = {
    command_id: commandUuid,
    action,
    ts,
    hmac: signer.sign(`${commandUuid}:${device.device_id}:${action}:${ts}`),
  };
  // Đăng ký chờ ack TRƯỚC khi publish để không lỡ ack về cực nhanh
  const waiter = registerPending(commandUuid, {
    homeId: device.home_id,
    gatewayDbId: device.gateway_device_id,
    gatewayUid: device.gateway_uid,
    deviceUid: device.device_id,
    signer,
  });
  const topic = `${gatewayBaseTopic(device.home_id, device.gateway_uid)}/device/${device.device_id}/command`;
  if (!(await publishJson(topic, payload))) {
    waiter.cancel();
    return { kind: "timeout", errorCode: "PUBLISH_FAILED" };
  }
  await markCommand(rowId, "sent", null);
  return waiter.promise;
}

/**
 * Gửi lệnh bật/tắt tới một relay và chờ ack (≤ 5 s).
 *
 * Kiểm tra theo thứ tự: không tồn tại/chưa gán nhà → 404 · không phải relay → 400 NOT_CONTROLLABLE ·
 * bị chặn → 409 DEVICE_BLOCKED · nhà tạm ngưng → 409 HOME_SUSPENDED · không active hoặc offline
 * (last_seen > 90 s) → 409 DEVICE_OFFLINE. Quyền của người dùng với thiết bị KHÔNG kiểm ở đây —
 * người gọi phải gọi requireDeviceAccess(auth, id, "control_device") trước.
 *
 * Thành công: cập nhật power_state, device_commands → acked, phát bus `device_state`, ghi
 * user_behavior_logs và audit DEVICE_COMMAND. Thất bại: device_commands → timeout/failed, audit
 * DEVICE_COMMAND_FAILED rồi ném 504 TIMEOUT (không ack trong 5 s / broker không sẵn sàng) hoặc 502
 * COMMAND_FAILED (thiết bị báo lỗi).
 */
export async function sendDeviceCommand(input: SendDeviceCommandInput): Promise<SendDeviceCommandResult> {
  const device = await getDeviceRow(input.deviceId);
  if (!device || device.device_type === "gateway") throw notFound("Device not found");
  if (device.category !== "relay") throw new HttpError(400, "NOT_CONTROLLABLE", "Device is not a relay");
  if (device.home_id === null) throw notFound("Device is not assigned to a home");
  if (device.status === "blocked") throw new HttpError(409, "DEVICE_BLOCKED", "Device is blocked");
  if (device.home_status === "suspended") throw new HttpError(409, "HOME_SUSPENDED", "Home is suspended");
  if (device.status !== "active" || !isOnline(device.last_seen)) throw new HttpError(409, "DEVICE_OFFLINE", "Device is offline");

  const issuedAt = new Date();
  const rowId = await insertCommandRow(device, input.action, input.issuedBy, input.source, input.channel, issuedAt);
  const commandUuid = newUuid();

  const simulatedHandler = getSimulatedHandler();
  const outcome =
    device.is_simulated && simulatedHandler
      ? await runSimulated(simulatedHandler, { kind: "device", commandId: commandUuid, device, action: input.action })
      : await runMqttDeviceCommand(device, input.action, commandUuid, rowId);

  const verb = input.action === "turn_on" ? "Bật" : "Tắt";
  const failureBase = {
    homeId: device.home_id,
    deviceId: device.id,
    actorUserId: input.issuedBy,
    ip: input.meta?.ip ?? null,
    userAgent: input.meta?.userAgent ?? null,
  };

  if (outcome.kind === "timeout") {
    await markCommand(rowId, "timeout", outcome.errorCode);
    await logEvent({
      ...failureBase,
      eventType: "DEVICE_COMMAND_FAILED",
      message: `Lệnh ${verb.toLowerCase()} "${device.device_name}" không được thiết bị phản hồi`,
      details: { command_id: rowId, action: input.action, reason: outcome.errorCode, source: input.source, channel: input.channel },
    });
    throw new HttpError(504, "TIMEOUT", "Device did not acknowledge the command in time");
  }
  if (outcome.status === "error") {
    await markCommand(rowId, "failed", "DEVICE_ERROR");
    await logEvent({
      ...failureBase,
      eventType: "DEVICE_COMMAND_FAILED",
      message: `Thiết bị "${device.device_name}" báo lỗi khi thực hiện lệnh ${verb.toLowerCase()}`,
      details: { command_id: rowId, action: input.action, reason: "DEVICE_ERROR", source: input.source, channel: input.channel },
    });
    throw new HttpError(502, "COMMAND_FAILED", "Device reported an error while executing the command");
  }

  // Ack ok: ghi trạng thái mới
  const ackedAt = new Date();
  const newPower = outcome.power ?? (input.action === "turn_on");
  // power_state (bảng devices, qua facade) + device_commands → acked: cùng thành công hoặc cùng huỷ (invariant 9)
  await withTransaction(async (conn) => {
    await setDevicePowerState(device.id, newPower, conn);
    await markCommandAcked(rowId, ackedAt, conn);
  });

  const updated = (await getDeviceRow(device.id)) ?? { ...device, power_state: newPower };
  const stateEvent = toDeviceStateEvent(updated);
  if (stateEvent) eventBus.emit("device_state", stateEvent);

  await logBehavior({
    homeId: device.home_id,
    timezone: device.home_timezone ?? "Asia/Ho_Chi_Minh",
    userId: input.issuedBy,
    roomId: device.room_id,
    deviceId: device.id,
    deviceCategory: device.category,
    action: input.action === "turn_on" ? "TURN_ON" : "TURN_OFF",
    previousState: powerLabel(device.power_state === null ? null : toBool(device.power_state)),
    newState: powerLabel(newPower),
    source: input.behaviorSource ?? defaultBehaviorSource(input.source, input.channel),
    at: ackedAt,
  });
  await logEvent({
    ...failureBase,
    eventType: "DEVICE_COMMAND",
    message: `${verb} "${device.device_name}"`,
    details: { command_id: rowId, action: input.action, source: input.source, channel: input.channel, device_uid: device.device_id },
  });

  return {
    command: {
      id: rowId,
      action: input.action,
      status: "acked",
      issued_at: issuedAt.toISOString(),
      acked_at: ackedAt.toISOString(),
    },
    device: updated,
  };
}

/**
 * Use case của khách: gửi lệnh bật/tắt. Thứ tự: quyền (404/403) → nhà suspended (409) → sendDeviceCommand
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
