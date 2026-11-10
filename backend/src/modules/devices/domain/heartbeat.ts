// Topic + payload heartbeat gateway: home/<home_id>/gateway/<gateway_id>/heartbeat (docs/API_DESIGN.md).
import { isWellFormedUid } from "./hmac.service";

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

export interface HeartbeatPayload {
  ts: number;
  hmac: string;
  ip: string | null;
  /** UID các node gateway báo `online: true`. */
  onlineNodeUids: string[];
}

/** Đọc payload JSON; thiếu ts/hmac hoặc sai kiểu → null. Các trường tuỳ chọn sai kiểu thì bỏ qua. */
export function parseHeartbeatPayload(raw: string): HeartbeatPayload | null {
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) return null;
  const { ts, hmac, ip, nodes } = body as Record<string, unknown>;
  if (typeof ts !== "number" || !Number.isInteger(ts) || ts <= 0) return null;
  if (typeof hmac !== "string" || hmac.length === 0 || hmac.length > 128) return null;

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
  return { ts, hmac, ip: cleanIp, onlineNodeUids };
}
