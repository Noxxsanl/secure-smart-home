// Topic + payload heartbeat gateway: home/<home_id>/gateway/<gateway_id>/heartbeat (docs/API_DESIGN.md).
// Import thẳng từ shared (không qua hmac.service) để parse thuần này test được mà không nạp env/DB.
import { isHmacHex, isUnixSeconds, isValidCounter, isWellFormedUid } from "../../../shared/validation/device-input";

export const HEARTBEAT_TOPIC_FILTER = "home/+/gateway/+/heartbeat";
/** Số phần tử `nodes` tối đa xử lý trong một heartbeat (chặn payload phình to). */
export const MAX_HEARTBEAT_NODES = 32;

export interface HeartbeatTopic {
  homeId: number;
  gatewayUid: string;
}

/** Tách `home/<home_id>/gateway/<gateway_id>/heartbeat`; sai định dạng → null. */
export function parseHeartbeatTopic(topic: string): HeartbeatTopic | null {
  const parts = topic.split("/");
  if (parts.length !== 5 || parts[0] !== "home" || parts[2] !== "gateway" || parts[4] !== "heartbeat") return null;
  if (!/^\d{1,9}$/.test(parts[1])) return null;
  const gatewayUid = parts[3];
  // UID từ topic sẽ được log → phải khớp mẫu chặt (chống log injection); sai thì bỏ, caller không log giá trị thô
  if (!isWellFormedUid(gatewayUid)) return null;
  return { homeId: Number(parts[1]), gatewayUid };
}

/** Phần nội dung heartbeat dùng chung cho dạng v2 (body_raw đã kiểm chữ ký) và dạng cũ. */
export interface HeartbeatBody {
  ip: string | null;
  /** Thời gian chạy (giây) Gateway tự báo; null nếu thiếu/sai kiểu. Dùng để phát hiện Gateway bị nhân bản. */
  uptime: number | null;
  /** UID các node gateway báo `online: true`. */
  onlineNodeUids: string[];
}

/** Trích ip/uptime/nodes từ object JSON heartbeat. Các trường tuỳ chọn sai kiểu thì bỏ qua. */
function extractHeartbeatBody(body: Record<string, unknown>): HeartbeatBody {
  const { ip, uptime, nodes } = body;
  const onlineNodeUids: string[] = [];
  if (Array.isArray(nodes)) {
    for (const node of nodes.slice(0, MAX_HEARTBEAT_NODES)) {
      if (typeof node !== "object" || node === null) continue;
      const { device_id, online } = node as Record<string, unknown>;
      if (online === true && isWellFormedUid(device_id)) {
        onlineNodeUids.push(device_id);
      }
    }
  }
  // ip do firmware tự báo: chỉ nhận chuỗi ký tự địa chỉ, tối đa 45 (cột last_ip VARCHAR(45))
  const cleanIp = typeof ip === "string" && /^[0-9a-fA-F.:]{1,45}$/.test(ip) ? ip : null;
  const cleanUptime = typeof uptime === "number" && Number.isFinite(uptime) && uptime >= 0 ? uptime : null;
  return { ip: cleanIp, uptime: cleanUptime, onlineNodeUids };
}

/** body_raw tối đa 4096 byte (hợp đồng v2 §2a); payload MQTT tối đa gấp 4 lần để chứa JSON bọc + escape. */
export const MAX_HEARTBEAT_BODY_RAW_BYTES = 4096;
export const MAX_HEARTBEAT_PAYLOAD_BYTES = 16 * 1024;

/** Heartbeat v2: `{"v":2,"ts","ctr","hmac","body_raw"}` — body_raw CHƯA parse (chỉ parse sau khi chữ ký đúng). */
export interface HeartbeatEnvelopeV2 {
  version: 2;
  ts: number;
  ctr: number;
  hmac: string;
  bodyRaw: string;
}

/** Heartbeat dạng cũ (không có "v"): chữ ký "<gateway_id>:<ts>", nội dung nằm thẳng trong payload. Chỉ khi DEVICE_HMAC_V1. */
export interface HeartbeatEnvelopeV1 extends HeartbeatBody {
  version: 1;
  ts: number;
  hmac: string;
}

export type HeartbeatEnvelope = HeartbeatEnvelopeV1 | HeartbeatEnvelopeV2;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Đọc payload JSON, nhận ra v2 (`"v":2`) hay dạng cũ (không có `v`); `v` khác → null. Thiếu/sai kiểu trường bắt buộc → null.
 * Với v2 chỉ kiểm hình dạng (hmac 64 hex, ts/ctr nguyên dương an toàn, body_raw ≤ 4096 byte) — chữ ký và nội dung
 * body_raw do handler kiểm sau.
 */
export function parseHeartbeatEnvelope(raw: string): HeartbeatEnvelope | null {
  if (raw.length > MAX_HEARTBEAT_PAYLOAD_BYTES) return null;
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isPlainObject(body)) return null;
  const { v, ts, hmac } = body;

  if (v === 2) {
    const { ctr, body_raw: bodyRaw } = body;
    if (!isUnixSeconds(ts) || !isValidCounter(ctr) || !isHmacHex(hmac)) return null;
    if (typeof bodyRaw !== "string" || bodyRaw.length === 0 || Buffer.byteLength(bodyRaw, "utf8") > MAX_HEARTBEAT_BODY_RAW_BYTES) {
      return null;
    }
    return { version: 2, ts, ctr, hmac, bodyRaw };
  }
  if (v !== undefined) return null;

  if (typeof ts !== "number" || !Number.isInteger(ts) || ts <= 0) return null;
  if (typeof hmac !== "string" || hmac.length === 0 || hmac.length > 128) return null;
  return { version: 1, ts, hmac, ...extractHeartbeatBody(body) };
}

/** Parse body_raw của heartbeat v2 (gọi SAU khi chữ ký đã đúng); không phải object JSON → null. */
export function parseHeartbeatBodyRaw(bodyRaw: string): HeartbeatBody | null {
  let body: unknown;
  try {
    body = JSON.parse(bodyRaw);
  } catch {
    return null;
  }
  return isPlainObject(body) ? extractHeartbeatBody(body) : null;
}
