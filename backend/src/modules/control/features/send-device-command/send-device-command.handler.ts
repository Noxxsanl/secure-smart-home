// Lệnh bật/tắt relay + đặt nhiệt độ điều hoà IR (CONTRACT_V2 §4.2 commands, §6 Command service, §7 MQTT).
//
//   commandDevice      use case của khách (portal/mobile): quyền (404/403) → nhà suspended (409) → sendDeviceCommand.
//   sendDeviceCommand  bật/tắt (hoặc set_temp_<NN> / learn_off / learn_t<NN> với điều hoà) một relay, chờ ack ≤ 5 s (learn_*: ≤ 15 s) → { command, device } hoặc ném HttpError.
//                      Cũng được automation engine gọi (qua control.facade).
//
// Chữ ký lệnh/ack là HMAC-SHA256 bằng secret của GATEWAY (CONTRACT §7). secret_key chỉ được SELECT trong module
// devices (getGatewaySigner — chỉ nhận hàm sign/verify); bộ ký giữ ở RAM tối đa 5 s (learn_*: 15 s) cho tới khi ack về, KHÔNG BAO GIỜ log hay trả ra
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
  learnSlotMask,
  CURTAIN_POS_MAX,
  CURTAIN_POS_MIN,
  parseLearnAction,
  parseSetPosAction,
  parseSetTempAction,
  requireDeviceAccess,
  setDeviceAcCodesBit,
  setDeviceAcSetpoint,
  setDeviceCurtainPos,
  setDevicePowerState,
  toCustomerDeviceOne,
  toDeviceStateEvent,
} from "../../../devices";
import type { CustomerDevice, DeviceCommandAction, DeviceRow } from "../../../devices";
import type { BehaviorSource } from "../../domain/behavior.types";
import { gatewayBaseTopic } from "../../domain/command-topics";
import type {
  CommandChannel,
  CommandSource,
  CommandSummary,
  SendDeviceCommandInput,
  SendDeviceCommandResult,
} from "../../domain/command.types";
import { ackTimeoutMs, registerPending, type AckOutcome } from "../../domain/pending-acks";
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

function tempLabel(setpoint: number | null): string | null {
  return setpoint === null ? null : `${setpoint}°C`;
}

async function runMqttDeviceCommand(device: DeviceRow, action: DeviceCommandAction, commandUuid: string, rowId: number): Promise<AckOutcome> {
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
  }, ackTimeoutMs(action));
  const topic = `${gatewayBaseTopic(device.home_id, device.gateway_uid)}/device/${device.device_id}/command`;
  if (!(await publishJson(topic, payload))) {
    waiter.cancel();
    return { kind: "timeout", errorCode: "PUBLISH_FAILED" };
  }
  await markCommand(rowId, "sent", null);
  return waiter.promise;
}

/**
 * Gửi lệnh bật/tắt tới một relay và chờ ack (≤ 5 s; lệnh học mã learn_* ≤ 15 s vì Node chờ người dùng bấm remote tối đa 10 s).
 *
 * Kiểm tra theo thứ tự: không tồn tại/chưa gán nhà → 404 · không phải relay → 400 NOT_CONTROLLABLE ·
 * set_temp_<NN> / learn_off / learn_t<NN> mà không phải điều hoà (appliance <> 'ac') → 400 NOT_CONTROLLABLE · set_pos_<N> mà không phải rèm
 * (appliance <> 'curtain') → 400 NOT_CONTROLLABLE · bị chặn → 409 DEVICE_BLOCKED · nhà tạm ngưng → 409 HOME_SUSPENDED · không active hoặc offline
 * (last_seen > 90 s) → 409 DEVICE_OFFLINE. Quyền của người dùng với thiết bị KHÔNG kiểm ở đây —
 * người gọi phải gọi requireDeviceAccess(auth, id, "control_device") trước.
 *
 * Thành công: cập nhật power_state (set_temp: ack.power ?? true, kèm ac_setpoint; set_pos_<N>: ack.power ?? N > 0; với rèm,
 * curtain_pos = N / 100 (turn_on) / 0 (turn_off) cùng transaction), device_commands → acked, phát bus
 * `device_state`, ghi user_behavior_logs và audit DEVICE_COMMAND. Riêng learn_*: KHÔNG đổi power_state/ac_setpoint
 * (chỉ bật bit mã tương ứng trong ac_codes) và KHÔNG ghi user_behavior_logs. Thất bại: device_commands → timeout/failed, audit
 * DEVICE_COMMAND_FAILED rồi ném 504 TIMEOUT (không ack trong 5 s, learn_*: 15 s / broker không sẵn sàng) hoặc 502
 * COMMAND_FAILED (thiết bị báo lỗi).
 */
export async function sendDeviceCommand(input: SendDeviceCommandInput): Promise<SendDeviceCommandResult> {
  const device = await getDeviceRow(input.deviceId);
  if (!device || device.device_type === "gateway") throw notFound("Device not found");
  if (device.category !== "relay") throw new HttpError(400, "NOT_CONTROLLABLE", "Device is not a relay");
  // set_temp_<NN> / learn_off / learn_t<NN>: chỉ điều hoà IR; set_pos_<N>: chỉ rèm; chuỗi lạ (không thuộc các dạng trên) là lỗi gọi hàm
  const setpoint = parseSetTempAction(input.action);
  const learnSlot = parseLearnAction(input.action);
  const curtainTarget = parseSetPosAction(input.action);
  if (learnSlot === null && setpoint === null && curtainTarget === null && input.action !== "turn_on" && input.action !== "turn_off") {
    throw new HttpError(400, "INVALID_INPUT", "Unsupported command action");
  }
  if ((setpoint !== null || learnSlot !== null) && device.appliance !== "ac") {
    throw new HttpError(400, "NOT_CONTROLLABLE", "set_temp and learn_code are only supported by air conditioners");
  }
  if (curtainTarget !== null && device.appliance !== "curtain") {
    throw new HttpError(400, "NOT_CONTROLLABLE", "set_pos is only supported by curtains");
  }
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

  // Tên hành động trong thông báo lỗi (chữ thường) và trong audit khi thành công
  const failVerb =
    learnSlot !== null
      ? "học mã remote"
      : setpoint !== null
      ? "đặt nhiệt độ"
      : curtainTarget !== null
      ? "mở rèm"
      : input.action === "turn_on"
      ? "bật"
      : "tắt";
  const successMessage =
    learnSlot !== null
      ? `Học mã remote "${device.device_name}" ${learnSlot === "off" ? "mã TẮT" : `${learnSlot}°C`}`
      : setpoint !== null
      ? `Đặt điều hòa "${device.device_name}" ${setpoint}°C`
      : curtainTarget !== null
      ? curtainTarget === 0
        ? `Đóng rèm "${device.device_name}"`
        : `Mở rèm "${device.device_name}" ${curtainTarget}%`
      : `${input.action === "turn_on" ? "Bật" : "Tắt"} "${device.device_name}"`;
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
      message: `Lệnh ${failVerb} "${device.device_name}" không được thiết bị phản hồi`,
      details: { command_id: rowId, action: input.action, reason: outcome.errorCode, source: input.source, channel: input.channel },
    });
    throw new HttpError(504, "TIMEOUT", "Device did not acknowledge the command in time");
  }
  if (outcome.status === "error") {
    await markCommand(rowId, "failed", "DEVICE_ERROR");
    await logEvent({
      ...failureBase,
      eventType: "DEVICE_COMMAND_FAILED",
      message: `Thiết bị "${device.device_name}" báo lỗi khi thực hiện lệnh ${failVerb}`,
      details: { command_id: rowId, action: input.action, reason: "DEVICE_ERROR", source: input.source, channel: input.channel },
    });
    throw new HttpError(502, "COMMAND_FAILED", "Device reported an error while executing the command");
  }

  // Ack ok: ghi trạng thái mới
  const ackedAt = new Date();
  // set_temp: điều hoà nhận lệnh đặt độ nghĩa là đang chạy → mặc định bật; turn_on/turn_off không đụng ac_setpoint
  // set_pos_<N>: mở tới N % nghĩa là rèm đang mở khi N > 0
  const newPower = outcome.power ?? (setpoint !== null ? true : curtainTarget !== null ? curtainTarget > 0 : input.action === "turn_on");
  // % mở rèm sau lệnh: set_pos_<N> → N; turn_on = mở hết (100), turn_off = đóng (0). Chỉ dòng rèm (appliance = 'curtain').
  const newCurtainPos =
    device.appliance !== "curtain" ? null : curtainTarget ?? (input.action === "turn_on" ? CURTAIN_POS_MAX : input.action === "turn_off" ? CURTAIN_POS_MIN : null);
  // power_state + ac_setpoint/curtain_pos (bảng devices, qua facade) + device_commands → acked: cùng thành công hoặc cùng huỷ (invariant 9)
  // learn_*: ack ok = Node đã học + lưu mã xong → chỉ bật bit của ô đó trong ac_codes; KHÔNG đụng power_state/ac_setpoint
  // (học mã không bật/tắt điều hoà thật, nên bỏ qua `power` trong ack)
  await withTransaction(async (conn) => {
    if (learnSlot !== null) {
      await setDeviceAcCodesBit(device.id, learnSlotMask(learnSlot), conn);
    } else {
      await setDevicePowerState(device.id, newPower, conn);
      if (setpoint !== null) await setDeviceAcSetpoint(device.id, setpoint, conn);
      if (newCurtainPos !== null) await setDeviceCurtainPos(device.id, newCurtainPos, conn);
    }
    await markCommandAcked(rowId, ackedAt, conn);
  });

  const updated = (await getDeviceRow(device.id)) ?? {
    ...device,
    power_state: newPower,
    curtain_pos: newCurtainPos ?? device.curtain_pos,
  };
  const stateEvent = toDeviceStateEvent(updated);
  if (stateEvent) eventBus.emit("device_state", stateEvent);

  // Học mã remote không phải hành vi dùng thiết bị → không ghi user_behavior_logs (khỏi làm bẩn gợi ý thói quen)
  if (learnSlot === null) {
    await logBehavior({
      homeId: device.home_id,
      timezone: device.home_timezone ?? "Asia/Ho_Chi_Minh",
      userId: input.issuedBy,
      roomId: device.room_id,
      deviceId: device.id,
      deviceCategory: device.category,
      // set_pos không có action riêng trong nhật ký hành vi (gợi ý thói quen chỉ hiểu bật/tắt): N > 0 → TURN_ON, N = 0 → TURN_OFF
      action:
        setpoint !== null
          ? "SET_TEMP"
          : curtainTarget !== null
          ? curtainTarget > 0
            ? "TURN_ON"
            : "TURN_OFF"
          : input.action === "turn_on"
          ? "TURN_ON"
          : "TURN_OFF",
      previousState:
        setpoint !== null ? tempLabel(device.ac_setpoint) : powerLabel(device.power_state === null ? null : toBool(device.power_state)),
      newState: setpoint !== null ? tempLabel(setpoint) : powerLabel(newPower),
      source: input.behaviorSource ?? defaultBehaviorSource(input.source, input.channel),
      at: ackedAt,
    });
  }
  await logEvent({
    ...failureBase,
    eventType: "DEVICE_COMMAND",
    message: successMessage,
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
 * Use case của khách: gửi lệnh bật/tắt hoặc đặt nhiệt độ điều hoà. Thứ tự: quyền (404/403) → nhà suspended (409) → sendDeviceCommand
 * (400 NOT_CONTROLLABLE, 409 DEVICE_BLOCKED/DEVICE_OFFLINE, 504 TIMEOUT). Kênh quyết định nguồn behaviour log.
 */
export async function commandDevice(
  auth: AuthContext,
  deviceId: number,
  action: DeviceCommandAction,
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
