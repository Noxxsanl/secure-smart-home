// Topic + payload sự kiện camera: home/<home_id>/gateway/<gateway_id>/device/<device_id>/camera/event
//   {"type":"motion","ts":1762760000,"snapshot_id":"345"?,"hmac":"<HMAC(secret gateway, \"<device_id>:motion:<ts>\")>"}
import { isWellFormedUid } from "../../devices";

export const CAMERA_EVENT_TOPIC_FILTER = "home/+/gateway/+/device/+/camera/event";

export interface CameraEventTopic {
  homeId: number;
  gatewayUid: string;
  cameraUid: string;
}

export function parseCameraEventTopic(topic: string): CameraEventTopic | null {
  const parts = topic.split("/");
  if (
    parts.length !== 8 ||
    parts[0] !== "home" ||
    parts[2] !== "gateway" ||
    parts[4] !== "device" ||
    parts[6] !== "camera" ||
    parts[7] !== "event"
  ) {
    return null;
  }
  if (!/^\d{1,9}$/.test(parts[1])) return null;
  const gatewayUid = parts[3];
  const cameraUid = parts[5];
  // UID từ topic được log ở handler → phải khớp mẫu chặt (chống log injection); sai thì bỏ, không log giá trị thô
  if (!isWellFormedUid(gatewayUid) || !isWellFormedUid(cameraUid)) return null;
  return { homeId: Number(parts[1]), gatewayUid, cameraUid };
}

export interface CameraEventPayload {
  type: "motion";
  ts: number;
  hmac: string;
}

/** Chỉ nhận sự kiện `motion`; thiếu ts/hmac hoặc sai kiểu → null. */
export function parseCameraEventPayload(raw: string): CameraEventPayload | null {
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) return null;
  const { type, ts, hmac } = body as Record<string, unknown>;
  if (type !== "motion") return null;
  if (typeof ts !== "number" || !Number.isInteger(ts) || ts <= 0) return null;
  if (typeof hmac !== "string" || hmac.length === 0 || hmac.length > 128) return null;
  return { type, ts, hmac };
}
