// Kiểu + parse/kiểm đầu vào của 2 WebSocket camera live: uplink gateway (header HMAC) và viewer web (Origin).
import type { IncomingMessage } from "http";
import { env } from "../../../../config/env";
import { HttpError } from "../../../../shared/errors/http-error";
import { isWellFormedUid } from "../../../devices";

/** Uplink gateway → backend (xác thực HMAC gateway, kênh /api/device). */
export const UPLINK_PATH = "/api/device/camera/live";
/** Viewer web → backend (cookie sh_user, kênh /api/portal); nhóm bắt 1 = devices.id của camera. */
export const VIEWER_PATH = /^\/api\/portal\/cameras\/(\d{1,10})\/live$/;

/** devices.id là INT4: id lớn hơn (hoặc 0) không thể tồn tại → coi như không tìm thấy, khỏi để pg báo lỗi. */
const MAX_DEVICE_ID = 2_147_483_647;

/** Đổi nhóm bắt của VIEWER_PATH thành devices.id; null nếu ngoài khoảng 1…INT4 max. */
export function parseCameraId(raw: string | undefined): number | null {
  const id = Number(raw);
  return Number.isSafeInteger(id) && id >= 1 && id <= MAX_DEVICE_ID ? id : null;
}

/** Nguồn ghi vào audit khi xác thực uplink thất bại (cùng cơ chế với snapshot: "http_snapshot"). */
export const UPLINK_AUTH_SOURCE = "ws_camera_live";

export interface UplinkHeaders {
  gatewayUid: string;
  cameraUid: string;
  sessionId: string;
  timestamp: number;
  signature: string;
}

function header(req: IncomingMessage, name: string): string | undefined {
  const value = req.headers[name];
  const single = Array.isArray(value) ? value[0] : value;
  return single === undefined || single === "" ? undefined : single;
}

/**
 * Đọc + kiểm hình dạng header của yêu cầu upgrade uplink. Thiếu → 400 MISSING_GATEWAY_FIELDS; sai định dạng
 * → 400 INVALID_INPUT (mọi id khớp ^[A-Za-z0-9_.:-]{1,64}$ vì được ghi vào audit/log — không có xuống dòng).
 */
export function parseUplinkHeaders(req: IncomingMessage): UplinkHeaders {
  const gatewayUid = header(req, "x-gateway-id");
  const cameraUid = header(req, "x-device-id");
  const sessionId = header(req, "x-session-id");
  const timestamp = header(req, "x-timestamp");
  const signature = header(req, "x-signature");
  if (
    gatewayUid === undefined ||
    cameraUid === undefined ||
    sessionId === undefined ||
    timestamp === undefined ||
    signature === undefined
  ) {
    throw new HttpError(
      400,
      "MISSING_GATEWAY_FIELDS",
      "X-Gateway-Id, X-Device-Id, X-Session-Id, X-Timestamp and X-Signature are required"
    );
  }
  if (
    !isWellFormedUid(gatewayUid) ||
    !isWellFormedUid(cameraUid) ||
    !isWellFormedUid(sessionId) ||
    !/^\d{1,12}$/.test(timestamp)
  ) {
    throw new HttpError(400, "INVALID_INPUT", "Malformed identity headers");
  }
  return { gatewayUid, cameraUid, sessionId, timestamp: Number(timestamp), signature };
}

/** Chuỗi ký của uplink: HMAC-SHA256(secret gateway, "<gateway_id>:<ts>:<device_id>:<session_id>"). */
export function buildUplinkSigningString(headers: UplinkHeaders): string {
  return `${headers.gatewayUid}:${headers.timestamp}:${headers.cameraUid}:${headers.sessionId}`;
}

function originOf(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.origin : null;
  } catch {
    return null;
  }
}

/**
 * Chống Cross-Site WebSocket Hijacking (xác thực bằng cookie nên trình duyệt tự gửi cookie cho mọi origin): header
 * `Origin` BẮT BUỘC; hợp lệ nếu (a) host của Origin = Host của yêu cầu (hoặc X-Forwarded-Host khi TRUST_PROXY bật —
 * chỉ proxy tin cậy mới đặt được header đó), hoặc (b) Origin nằm trong FRONTEND_URL (cùng nguồn cấu hình với CORS).
 */
export function isAllowedViewerOrigin(req: IncomingMessage): boolean {
  const rawOrigin = header(req, "origin");
  if (rawOrigin === undefined) return false;
  const origin = originOf(rawOrigin);
  if (origin === null) return false;
  if (env.frontendOrigins.some((allowed) => originOf(allowed) === origin)) return true;

  const forwarded = env.trustProxy !== false ? header(req, "x-forwarded-host")?.split(",")[0]?.trim() : undefined;
  const host = forwarded || header(req, "host");
  if (!host) return false;
  return new URL(origin).host.toLowerCase() === host.toLowerCase();
}
