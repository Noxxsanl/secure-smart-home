// Điều khiển thiết bị (CONTRACT_V2 §4.2 commands, §6 Command service, §7 MQTT).
//
//   sendDeviceCommand   bật/tắt một relay, chờ ack ≤ 5 s → { command, device } hoặc ném HttpError.
//   sendGatewayCommand  restart / factory_reset gateway (fire-and-forget).
//   publishOtaCommand   phát lệnh OTA tới một gateway.
//   startCommandAckListener  subscribe ack từ Broker 2 (TLS, kiểm chứng chứng chỉ — invariant 3).
//   registerSimulatedCommandHandler  simulator đăng ký để tự "ack" cho thiết bị is_simulated=1.
//
// Chữ ký lệnh/ack là HMAC-SHA256 bằng secret của GATEWAY (CONTRACT §7). secret_key chỉ được SELECT
// trong loadGatewaySecret() dưới đây, giữ ở RAM tối đa 5 s cho tới khi ack về, KHÔNG BAO GIỜ log
// hay trả ra ngoài (invariant 1, 2).
import type { MqttClient } from "mqtt";
import { connectBroker } from "../../config/mqtt";
import type { RequestMeta } from "../../lib/clientIp";
import { hmacHex, newUuid, safeEqualHex } from "../../lib/crypto";
import { queryOne, runSql, toBool } from "../../lib/db";
import { eventBus } from "../../lib/eventBus";
import { HttpError, notFound } from "../../lib/http";
import { isOnline } from "../../lib/time";
import { logEvent } from "../logs/logEvent";
import { logBehavior, type BehaviorSource } from "./behaviorLog";
import { getDeviceRow, toDeviceStateEvent } from "./deviceReadModel";
import type { DeviceAction, DeviceRow, GatewayAction } from "./devices.types";

// ── Kiểu công khai ─────────────────────────────────────────────────────────

export type CommandSource = "user" | "automation" | "operator";
export type CommandChannel = "mobile" | "web" | "dashboard" | "system";

export interface SendDeviceCommandInput {
  deviceId: number;
  action: DeviceAction;
  /** users.id người ra lệnh (null khi automation/hệ thống). */
  issuedBy: number | null;
  source: CommandSource;
  channel: CommandChannel;
  /** Ghi đè nguồn trong user_behavior_logs — automation engine truyền 'ai_suggested' cho rule sinh từ gợi ý. */
  behaviorSource?: BehaviorSource;
  /** IP/User-Agent của request để ghi audit (không có thì bỏ trống). */
  meta?: Partial<RequestMeta>;
}

/** Khớp CONTRACT §4.2: `command: { id, action, status: "acked", issued_at, acked_at }`. */
export interface CommandSummary {
  id: number;
  action: DeviceAction;
  status: "acked";
  issued_at: string;
  acked_at: string;
}

export interface SendDeviceCommandResult {
  command: CommandSummary;
  /** Trạng thái thiết bị SAU lệnh (power_state đã cập nhật) — người gọi map sang CustomerDevice/ConsoleDevice. */
  device: DeviceRow;
}

/** Lệnh gửi tới handler của simulator (thiết bị is_simulated=1 không đi qua MQTT). */
export type SimulatedCommand =
  | { kind: "device"; commandId: string; device: DeviceRow; action: DeviceAction }
  | { kind: "gateway"; commandId: string; device: DeviceRow; action: GatewayAction };

/** Handler trả ack như một thiết bị thật: simulator tự chờ 300–900 ms rồi resolve. */
export interface SimulatedAck {
  status: "ok" | "error";
  /** Trạng thái relay sau lệnh; bỏ trống thì suy từ action. */
  power?: boolean;
}
export type SimulatedCommandHandler = (command: SimulatedCommand) => Promise<SimulatedAck>;

let simulatedHandler: SimulatedCommandHandler | null = null;

/** Simulator gọi lúc khởi động. Gọi lại sẽ thay handler cũ. */
export function registerSimulatedCommandHandler(handler: SimulatedCommandHandler): void {
  simulatedHandler = handler;
}

// ── MQTT: topic, ack đang chờ ──────────────────────────────────────────────

const ACK_TIMEOUT_MS = 5000;
const TS_WINDOW_SECONDS = 300; // cùng cửa sổ chống replay với HMAC ingest (hmacService.ts)
const ACK_TOPIC_FILTER = "home/+/gateway/+/device/+/command/ack";

function gatewayBaseTopic(homeId: number, gatewayUid: string): string {
  return `home/${homeId}/gateway/${gatewayUid}`;
}

type AckOutcome =
  | { kind: "ack"; status: "ok" | "error"; power: boolean | null }
  | { kind: "timeout"; errorCode: string };

interface PendingAck {
  homeId: number;
  gatewayDbId: number;
  gatewayUid: string;
  deviceUid: string;
  /** Secret của gateway để kiểm HMAC ack — chỉ trong RAM, xoá khi xong. */
  secret: string;
  resolve: (outcome: AckOutcome) => void;
  badHmacLogged: boolean;
}

const pendingAcks = new Map<string, PendingAck>();
let commandClient: MqttClient | null = null;

function registerPending(
  commandUuid: string,
  entry: Omit<PendingAck, "resolve" | "badHmacLogged">
): { promise: Promise<AckOutcome>; cancel: () => void } {
  let settle: (outcome: AckOutcome) => void = () => undefined;
  const promise = new Promise<AckOutcome>((resolve) => {
    settle = resolve;
  });
  const timer = setTimeout(() => {
    pendingAcks.delete(commandUuid);
    settle({ kind: "timeout", errorCode: "ACK_TIMEOUT" });
  }, ACK_TIMEOUT_MS);
  pendingAcks.set(commandUuid, {
    ...entry,
    badHmacLogged: false,
    resolve: (outcome) => {
      clearTimeout(timer);
      pendingAcks.delete(commandUuid);
      settle(outcome);
    },
  });
  return {
    promise,
    cancel: () => {
      clearTimeout(timer);
      pendingAcks.delete(commandUuid);
    },
  };
}

/** Xử lý một message ack. Ack lạ/muộn/sai chữ ký đều bị bỏ qua (CONTRACT §7). */
function handleAckMessage(topic: string, raw: string): void {
  // home/{homeId}/gateway/{gwUid}/device/{devUid}/command/ack
  const parts = topic.split("/");
  if (parts.length !== 8 || parts[0] !== "home" || parts[2] !== "gateway" || parts[4] !== "device" || parts[6] !== "command" || parts[7] !== "ack") {
    return;
  }

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return;
  }
  if (typeof body !== "object" || body === null) return;
  const { command_id: commandId, status, power, ts, hmac } = body as Record<string, unknown>;
  if (typeof commandId !== "string") return;

  const entry = pendingAcks.get(commandId);
  if (!entry) return; // ack không biết hoặc đến muộn sau timeout
  // Ack phải đến đúng topic của lệnh đã gửi — chặn ack của thiết bị/nhà khác mạo danh command_id
  if (parts[1] !== String(entry.homeId) || parts[3] !== entry.gatewayUid || parts[5] !== entry.deviceUid) return;

  if ((status !== "ok" && status !== "error") || typeof ts !== "number" || typeof hmac !== "string") return;
  if (Math.abs(Date.now() / 1000 - ts) > TS_WINDOW_SECONDS) return;

  const expected = hmacHex(entry.secret, `${commandId}:${status}:${ts}`);
  if (!safeEqualHex(expected, hmac)) {
    if (!entry.badHmacLogged) {
      entry.badHmacLogged = true; // chỉ log lần đầu mỗi lệnh để kẻ gửi rác không làm ngập log
      void logEvent({
        eventType: "GATEWAY_AUTH_FAIL",
        deviceId: entry.gatewayDbId,
        message: "Ack lệnh có chữ ký HMAC không hợp lệ",
        details: { reason: "ack_hmac_mismatch", source: "mqtt" },
      });
    }
    return;
  }
  entry.resolve({ kind: "ack", status, power: typeof power === "boolean" ? power : null });
}

/**
 * Kết nối Broker 2 (TLS) và subscribe ack lệnh. Gọi 1 lần lúc khởi động (server.ts). Broker chưa
 * lên thì mqtt.js tự kết nối lại; trong lúc đó lệnh tới thiết bị thật kết thúc bằng TIMEOUT.
 * Cũng dùng chính client này để publish lệnh/OTA.
 */
export function startCommandAckListener(): void {
  if (commandClient) return;
  const client = connectBroker("iot-backend-commands");
  commandClient = client;

  client.on("connect", () => {
    console.log("[commands] connected, subscribing to command acks");
    client.subscribe(ACK_TOPIC_FILTER, { qos: 1 }, (err) => {
      if (err) console.error("[commands] subscribe failed:", err.message);
    });
  });
  client.on("message", (topic: string, payload: Buffer) => {
    try {
      handleAckMessage(topic, payload.toString());
    } catch (err) {
      console.error("[commands] failed to handle ack:", err instanceof Error ? err.message : "unknown error");
    }
  });
  client.on("error", (err) => {
    console.error("[commands] error:", err.message);
  });
}

/** Publish JSON QoS 1. false nếu broker chưa kết nối hoặc publish lỗi (không chờ kết nối lại để khỏi gửi lệnh "trễ"). */
function publishJson(topic: string, body: Record<string, unknown>): Promise<boolean> {
  const client = commandClient;
  if (!client || !client.connected) return Promise.resolve(false);
  return new Promise<boolean>((resolve) => {
    client.publish(topic, JSON.stringify(body), { qos: 1, retain: false }, (err) => resolve(!err));
  });
}

/** secret_key của GATEWAY — chỗ DUY NHẤT (ngoài hmacService) đọc cột này, chỉ để ký lệnh. */
async function loadGatewaySecret(gatewayDbId: number): Promise<string | null> {
  const row = await queryOne<{ secret_key: string }>(
    "SELECT secret_key FROM devices WHERE id = ? AND device_type = 'gateway'",
    [gatewayDbId]
  );
  return row?.secret_key ?? null;
}

// ── device_commands ────────────────────────────────────────────────────────

async function insertCommandRow(
  device: DeviceRow,
  command: string,
  issuedBy: number | null,
  source: CommandSource,
  channel: CommandChannel,
  issuedAt: Date
): Promise<number> {
  const result = await runSql(
    `INSERT INTO device_commands (device_id, home_id, issued_by, source, channel, command, status, issued_at)
     VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)
     RETURNING id`,
    [device.id, device.home_id, issuedBy, source, channel, command, issuedAt]
  );
  return result.insertId;
}

async function markCommand(rowId: number, status: "sent" | "failed" | "timeout", errorCode: string | null): Promise<void> {
  try {
    await runSql("UPDATE device_commands SET status = ?, error_code = ? WHERE id = ?", [status, errorCode, rowId]);
  } catch (err) {
    console.error("[commands] failed to update command status:", err instanceof Error ? err.message : "unknown error");
  }
}

// ── Lệnh bật/tắt relay ─────────────────────────────────────────────────────

function defaultBehaviorSource(source: CommandSource, channel: CommandChannel): BehaviorSource {
  if (source === "automation") return "automation";
  if (source === "operator" || channel === "dashboard") return "dashboard";
  return channel === "mobile" ? "mobile" : "manual";
}

function powerLabel(on: boolean | null): string | null {
  return on === null ? null : on ? "ON" : "OFF";
}

async function runSimulated(handler: SimulatedCommandHandler, command: SimulatedCommand): Promise<AckOutcome> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<AckOutcome>((resolve) => {
    timer = setTimeout(() => resolve({ kind: "timeout", errorCode: "ACK_TIMEOUT" }), ACK_TIMEOUT_MS);
  });
  const handled = handler(command).then(
    (ack): AckOutcome => ({ kind: "ack", status: ack.status, power: typeof ack.power === "boolean" ? ack.power : null }),
    (): AckOutcome => ({ kind: "ack", status: "error", power: null })
  );
  try {
    return await Promise.race([handled, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

async function runMqttDeviceCommand(device: DeviceRow, action: DeviceAction, commandUuid: string, rowId: number): Promise<AckOutcome> {
  if (device.gateway_device_id === null || device.gateway_uid === null || device.home_id === null) {
    return { kind: "timeout", errorCode: "NO_GATEWAY" };
  }
  const secret = await loadGatewaySecret(device.gateway_device_id);
  if (!secret) return { kind: "timeout", errorCode: "NO_GATEWAY" };
  if (!commandClient || !commandClient.connected) return { kind: "timeout", errorCode: "BROKER_DOWN" };

  const ts = Math.floor(Date.now() / 1000);
  const payload = {
    command_id: commandUuid,
    action,
    ts,
    hmac: hmacHex(secret, `${commandUuid}:${device.device_id}:${action}:${ts}`),
  };
  // Đăng ký chờ ack TRƯỚC khi publish để không lỡ ack về cực nhanh
  const waiter = registerPending(commandUuid, {
    homeId: device.home_id,
    gatewayDbId: device.gateway_device_id,
    gatewayUid: device.gateway_uid,
    deviceUid: device.device_id,
    secret,
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
  await runSql("UPDATE devices SET power_state = ? WHERE id = ?", [newPower, device.id]);
  await runSql("UPDATE device_commands SET status = 'acked', error_code = NULL, acked_at = ? WHERE id = ?", [ackedAt, rowId]);

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

// ── Lệnh gateway & OTA ─────────────────────────────────────────────────────

export interface SendGatewayCommandInput {
  /** devices.id của dòng gateway. */
  gatewayId: number;
  action: GatewayAction;
  issuedBy: number;
  meta?: Partial<RequestMeta>;
}

export interface SendGatewayCommandResult {
  /** UUID đã gửi trong payload MQTT (CONTRACT §5: `202 { command_id }`). */
  commandId: string;
  /** device_commands.id — để tra Device Command Log. */
  rowId: number;
}

async function dispatchGatewayCommand(gateway: DeviceRow, action: GatewayAction, commandUuid: string, rowId: number): Promise<void> {
  if (gateway.is_simulated && simulatedHandler) {
    const outcome = await runSimulated(simulatedHandler, { kind: "gateway", commandId: commandUuid, device: gateway, action });
    if (outcome.kind === "ack" && outcome.status === "ok") {
      await runSql("UPDATE device_commands SET status = 'acked', acked_at = ? WHERE id = ?", [new Date(), rowId]);
    } else {
      await markCommand(rowId, "failed", outcome.kind === "timeout" ? outcome.errorCode : "DEVICE_ERROR");
    }
    return;
  }
  if (gateway.home_id === null) {
    await markCommand(rowId, "failed", "NO_HOME");
    return;
  }
  const secret = await loadGatewaySecret(gateway.id);
  if (!secret) {
    await markCommand(rowId, "failed", "NO_GATEWAY");
    return;
  }
  const ts = Math.floor(Date.now() / 1000);
  const payload = {
    command_id: commandUuid,
    action,
    ts,
    hmac: hmacHex(secret, `${commandUuid}:${gateway.device_id}:${action}:${ts}`),
  };
  const published = await publishJson(`${gatewayBaseTopic(gateway.home_id, gateway.device_id)}/command`, payload);
  await markCommand(rowId, published ? "sent" : "failed", published ? null : "BROKER_DOWN");
}

/**
 * Restart / factory-reset gateway, fire-and-forget (CONTRACT §6): ghi device_commands + audit
 * (GATEWAY_RESTART | GATEWAY_FACTORY_RESET) rồi trả ngay; việc gửi MQTT/simulator chạy nền và cập nhật
 * status 'sent'/'acked'/'failed'. Người gọi chịu trách nhiệm quyền (factory-reset của OPERATOR trên
 * nhà đã claim cần grant — requireOperatorHomeAccess). Gateway chưa gán nhà → 409 GATEWAY_NOT_ASSIGNED.
 */
export async function sendGatewayCommand(input: SendGatewayCommandInput): Promise<SendGatewayCommandResult> {
  const gateway = await getDeviceRow(input.gatewayId);
  if (!gateway || gateway.device_type !== "gateway") throw notFound("Gateway not found");
  if (gateway.home_id === null) throw new HttpError(409, "GATEWAY_NOT_ASSIGNED", "Gateway is not assigned to a home");

  const commandUuid = newUuid();
  const rowId = await insertCommandRow(gateway, input.action, input.issuedBy, "operator", "dashboard", new Date());

  const restart = input.action === "restart";
  await logEvent({
    eventType: restart ? "GATEWAY_RESTART" : "GATEWAY_FACTORY_RESET",
    homeId: gateway.home_id,
    deviceId: gateway.id,
    actorUserId: input.issuedBy,
    message: restart
      ? `Yêu cầu khởi động lại gateway ${gateway.device_id}`
      : `Yêu cầu khôi phục cài đặt gốc gateway ${gateway.device_id}`,
    ip: input.meta?.ip ?? null,
    userAgent: input.meta?.userAgent ?? null,
    details: { command_id: rowId, action: input.action },
  });

  void dispatchGatewayCommand(gateway, input.action, commandUuid, rowId).catch((err: unknown) => {
    console.error("[commands] gateway command dispatch failed:", err instanceof Error ? err.message : "unknown error");
  });
  return { commandId: commandUuid, rowId };
}

export interface PublishOtaCommandInput {
  /** devices.id của gateway nhận lệnh OTA. */
  gatewayId: number;
  jobId: number;
  version: string;
  targetType: "gateway" | "node";
  checksumSha256: string;
}

/**
 * Phát lệnh OTA tới gateway (CONTRACT §7): `home/{home}/gateway/{uid}/ota/command`. Trả true nếu đã
 * publish, false nếu không thể (gateway chưa gán nhà, broker chưa kết nối…). Không bao giờ ném lỗi;
 * người gọi quyết định đánh dấu ota_history là failed hay chờ. Gateway mô phỏng không cần gọi hàm này.
 */
export async function publishOtaCommand(input: PublishOtaCommandInput): Promise<boolean> {
  try {
    const gateway = await getDeviceRow(input.gatewayId);
    if (!gateway || gateway.device_type !== "gateway" || gateway.home_id === null) return false;
    const secret = await loadGatewaySecret(gateway.id);
    if (!secret) return false;
    const ts = Math.floor(Date.now() / 1000);
    return await publishJson(`${gatewayBaseTopic(gateway.home_id, gateway.device_id)}/ota/command`, {
      job_id: input.jobId,
      version: input.version,
      target_type: input.targetType,
      checksum_sha256: input.checksumSha256,
      ts,
      hmac: hmacHex(secret, `${input.jobId}:${input.version}:${ts}`),
    });
  } catch (err) {
    console.error("[commands] publishOtaCommand failed:", err instanceof Error ? err.message : "unknown error");
    return false;
  }
}
