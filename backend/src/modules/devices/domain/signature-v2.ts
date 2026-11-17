// Chữ ký telemetry v2 (API_DESIGN §3, bất biến 5) — hàm THUẦN (không DB/env) để backend, test và kịch bản tấn công
// cùng một định nghĩa. Firmware dựng đúng các chuỗi này trong firmware/common/security_manager (sm_*_v2).
//
//   Node:    HMAC-SHA256(secret node,    "v2|sn|<sensor_id>|<sn_timestamp>|<sn_ctr>|<sha256_hex(data_raw)>")
//   Gateway: HMAC-SHA256(secret gateway, "v2|gw|<gateway_id>|<gw_timestamp>|<gateway_ip>|<sensor_id>|<sn_ctr>|<sn_hmac>")
//
// - data_raw: đúng chuỗi JSON Node đã ký (Gateway chuyển nguyên văn, không parse lại) → sửa một ký tự là sai chữ ký.
// - sn_ctr: số nguyên tăng NGẶT theo từng thiết bị (≈ unix ms, xem firmware sm_counter) → backend lưu last_ctr và
//   từ chối gói có ctr ≤ last_ctr: gửi lại nguyên gói trong cửa sổ ±300 s cũng bị chặn.
// - Chữ ký Gateway phủ sn_hmac (vốn đã cam kết nội dung) + sensor_id + ctr + gateway_ip: Gateway "bảo lãnh" đúng gói đó.
// - Secret Node chỉ Node và backend biết (Gateway không giữ) → lớp chữ ký Node độc lập với Gateway.
// - Mọi trường đã được kiểm không chứa `|` (UID theo isWellFormedUid, số nguyên, hex, IP) nên chuỗi ký không nhập nhằng.
// - Tiền tố "v2|sn|" / "v2|gw|" tách miền với chuỗi v1 "<id>:<ts>" và các chuỗi ký khác (lệnh, ack, heartbeat, ảnh).
import { hmacHex, safeEqualHex, sha256Hex } from "../../../shared/crypto";

/**
 * ctr không được vượt quá giờ hiện tại (ms) + 1 ngày. Firmware đặt ctr ≈ unix ms nên giá trị hợp lệ luôn quanh "bây giờ";
 * chặn trên để một lần gửi nhầm (VD chạy thử với secret thật và ctr khổng lồ) không đẩy last_ctr lên trời rồi khoá thiết bị
 * thật vĩnh viễn.
 */
export const COUNTER_MAX_AHEAD_MS = 24 * 60 * 60 * 1000;
export function isCounterInRange(ctr: number, nowMs: number = Date.now()): boolean {
  return ctr <= nowMs + COUNTER_MAX_AHEAD_MS;
}

export interface SensorTelemetryFieldsV2 {
  sensorId: string;
  snTimestamp: number;
  snCtr: number;
  /** Chuỗi JSON nguyên văn Node đã ký (object), VD `{"temperature":25.3,"humidity":60.1}`. */
  dataRaw: string;
}

export interface GatewayTelemetryFieldsV2 {
  gatewayId: string;
  gwTimestamp: number;
  /** IP STA của Gateway do firmware tự báo; "" khi Gateway chưa có IP (ký chuỗi rỗng). */
  gatewayIp: string;
  sensorId: string;
  snCtr: number;
  /** sn_hmac đúng như Gateway nhận và chuyển tiếp (so khớp từng ký tự). */
  snHmac: string;
}

/**
 * Heartbeat Gateway → Server (MQTT `home/<home>/gateway/<gw>/heartbeat`). Khoá = secret Gateway.
 *   hmac = HMAC(secret gw, "v2|hb|<gw>|<ts>|<ctr>|<sha256_hex(body_raw)>")
 * body_raw = JSON nguyên văn Gateway đã ký (uptime, rssi?, ip?, fw_version, nodes) — chỉ parse SAU khi chữ ký đúng.
 * ctr lấy từ sm_counter_next của Gateway, backend chiếm trên devices.last_ctr của DÒNG GATEWAY (claimDeviceCounter).
 */
export interface HeartbeatFieldsV2 {
  gatewayId: string;
  ts: number;
  ctr: number;
  bodyRaw: string;
}

/**
 * Ack lệnh Gateway → Server (`…/device/<device_uid>/command/ack`). Không có ctr: command_id dùng 1 lần
 * (pending entry bị xoá sau ack đầu tiên). `power` null = ack không có trường power → ký chuỗi rỗng.
 *   hmac = HMAC(secret gw, "v2|ack|<gw>|<device_uid>|<command_id>|<status>|<power>|<ts>")
 */
export interface AckFieldsV2 {
  gatewayId: string;
  deviceUid: string;
  commandId: string;
  status: "ok" | "error";
  power: boolean | null;
  ts: number;
}

/**
 * Sự kiện camera Gateway → Server (`…/device/<cam_id>/camera/event`). Không có ctr (backend đã chống lặp 60 s/camera).
 *   hmac = HMAC(secret gw, "v2|evt|<gw>|<cam_id>|<type>|<ts>|<snapshot_id hoặc rỗng>")
 */
export interface CameraEventFieldsV2 {
  gatewayId: string;
  cameraId: string;
  type: string;
  ts: number;
  /** null = sự kiện không kèm ảnh → ký chuỗi rỗng. */
  snapshotId: string | null;
}

export function heartbeatMessageV2(f: HeartbeatFieldsV2): string {
  return `v2|hb|${f.gatewayId}|${f.ts}|${f.ctr}|${sha256Hex(f.bodyRaw)}`;
}

export function ackMessageV2(f: AckFieldsV2): string {
  const power = f.power === null ? "" : f.power ? "1" : "0";
  return `v2|ack|${f.gatewayId}|${f.deviceUid}|${f.commandId}|${f.status}|${power}|${f.ts}`;
}

export function cameraEventMessageV2(f: CameraEventFieldsV2): string {
  return `v2|evt|${f.gatewayId}|${f.cameraId}|${f.type}|${f.ts}|${f.snapshotId ?? ""}`;
}

export function sensorMessageV2(f: SensorTelemetryFieldsV2): string {
  return `v2|sn|${f.sensorId}|${f.snTimestamp}|${f.snCtr}|${sha256Hex(f.dataRaw)}`;
}

export function gatewayMessageV2(f: GatewayTelemetryFieldsV2): string {
  return `v2|gw|${f.gatewayId}|${f.gwTimestamp}|${f.gatewayIp}|${f.sensorId}|${f.snCtr}|${f.snHmac}`;
}

/** HMAC-SHA256(secret, message) hex thường — key là chuỗi secret nguyên văn (không decode hex), như mọi chữ ký thiết bị. */
export function signMessage(secret: string, message: string): string {
  return hmacHex(secret, message);
}

/** So chữ ký (hex hoa/thường) với HMAC của message, thời gian hằng. */
export function verifyMessage(secret: string, message: string, signature: string): boolean {
  return safeEqualHex(hmacHex(secret, message), signature);
}
