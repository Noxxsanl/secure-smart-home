// Topic + payload sự kiện camera: home/<home_id>/gateway/<gateway_id>/device/<device_id>/camera/event
//   {"v":2,"type":"motion","snapshot_id":"345"?,"ts":1762760000,"hmac":"<HMAC(secret gateway, \"v2|evt|<gw>|<cam>|motion|<ts>|<snapshot_id hoặc rỗng>\")>"}
// (dạng cũ không có "v": chữ ký "<device_id>:motion:<ts>", chỉ nhận khi DEVICE_HMAC_V1 — hợp đồng A+B §2c–2d)
import { isHmacHex, isUnixSeconds, isWellFormedUid } from "../../devices";

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
  /** 2 = `"v":2` (chữ ký "v2|evt|…"); 1 = dạng cũ không có `v` (chữ ký "<cam>:motion:<ts>", chỉ khi DEVICE_HMAC_V1). */
  version: 1 | 2;
  type: "motion";
  ts: number;
  hmac: string;
  /** Chỉ v2: mã ảnh kèm sự kiện (tuỳ chọn); null = không có → ký chuỗi rỗng. */
  snapshotId: string | null;
}

/**
 * Chỉ nhận sự kiện `motion`; thiếu ts/hmac hoặc sai kiểu → null. `v` có mặt mà khác 2 → null.
 * v2: hmac phải là 64 hex, snapshot_id (nếu có) phải theo mẫu UID (không chứa `|`, ≤ 64 ký tự) vì nằm trong chuỗi ký.
 */
export function parseCameraEventPayload(raw: string): CameraEventPayload | null {
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) return null;
  const { v, type, ts, hmac, snapshot_id: snapshotId } = body as Record<string, unknown>;
  if (type !== "motion") return null;
  if (v === 2) {
    if (!isUnixSeconds(ts) || !isHmacHex(hmac)) return null;
    if (snapshotId !== undefined && !isWellFormedUid(snapshotId)) return null;
    return { version: 2, type, ts, hmac, snapshotId: snapshotId === undefined ? null : snapshotId };
  }
  if (v !== undefined) return null;
  if (typeof ts !== "number" || !Number.isInteger(ts) || ts <= 0) return null;
  if (typeof hmac !== "string" || hmac.length === 0 || hmac.length > 128) return null;
  return { version: 1, type, ts, hmac, snapshotId: null };
}
