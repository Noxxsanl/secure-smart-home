// Phần DÙNG CHUNG của viewer web (cookie) và viewer Mobile (Bearer qua khung auth): sau khi đã xác thực xong thì kiểm quyền
// xem camera rồi gắn vào phiên. Chỉ khác nhau ở cách xác thực + kênh ghi audit — logic quyền/giới hạn giữ ở MỘT chỗ để
// 2 kênh không lệch nhau (vd GUEST → 4403, camera mô phỏng → 4501).
import { WebSocket } from "ws";
import type { AuthContext } from "../../../../core/auth/auth-context";
import { HttpError } from "../../../../shared/errors/http-error";
import { requireDeviceAccess } from "../../../devices";
import { LIVE_CLOSE, registerOpenAttempt, type LiveViewer } from "../../domain/live-session";
import { joinViewer, leaveViewer } from "./live-relay.handler";

/** Danh tính đã xác thực: `expiresAt` + `tokenVersion` để ticker kiểm lại 30 s/lần (hết hạn / thu hồi → 4401). */
export interface ViewerIdentity {
  auth: AuthContext;
  tokenVersion: number;
  expiresAt: Date;
}

export function closeWith(ws: WebSocket, code: number, reason: string): void {
  try {
    ws.close(code, reason);
  } catch {
    ws.terminate();
  }
}

export async function runViewer(
  ws: WebSocket,
  identity: ViewerIdentity,
  channel: "portal" | "mobile",
  cameraId: number,
  ip: string | null,
  userAgent: string | null
): Promise<void> {
  let viewer: LiveViewer | null = null;
  ws.on("pong", () => {
    if (viewer) viewer.alive = true;
  });
  ws.on("message", () => {
    // viewer không cần gửi gì; bỏ qua (maxPayload nhỏ chặn payload lớn)
  });
  ws.on("error", () => {
    // lỗi socket kéo theo "close"; không log để khỏi lộ nội dung
  });
  ws.on("close", () => {
    if (viewer) leaveViewer(viewer, "client_closed");
  });

  // Giới hạn 10 lần mở / phút / user, tính trước các truy vấn DB để người spam không tốn thêm tài nguyên
  if (!registerOpenAttempt(identity.auth.userId, Date.now())) {
    closeWith(ws, LIVE_CLOSE.RATE_LIMITED, "rate_limited");
    return;
  }

  let access;
  try {
    access = await requireDeviceAccess(identity.auth, cameraId, "view");
  } catch (err) {
    if (err instanceof HttpError && err.status === 404) closeWith(ws, LIVE_CLOSE.NOT_FOUND, "not_found");
    else if (err instanceof HttpError && err.status === 403) closeWith(ws, LIVE_CLOSE.FORBIDDEN, "forbidden");
    else {
      console.error("[camera-live] viewer access check failed:", err instanceof Error ? err.message : "unknown error");
      closeWith(ws, 1011, "internal_error");
    }
    return;
  }
  if (ws.readyState !== WebSocket.OPEN) return; // client đã đi trong lúc kiểm quyền

  const { device } = access;
  if (device.category !== "camera") {
    closeWith(ws, LIVE_CLOSE.NOT_FOUND, "not_found");
    return;
  }
  if (access.access.role === "GUEST") {
    closeWith(ws, LIVE_CLOSE.FORBIDDEN, "forbidden");
    return;
  }
  if (device.is_simulated) {
    closeWith(ws, LIVE_CLOSE.UNSUPPORTED, "simulated_camera");
    return;
  }
  if (device.home_id === null || device.gateway_device_id === null || device.gateway_uid === null) {
    closeWith(ws, LIVE_CLOSE.CAMERA_TIMEOUT, "camera_unavailable");
    return;
  }

  const joined = joinViewer({
    ws,
    auth: identity.auth,
    tokenVersion: identity.tokenVersion,
    expiresAt: identity.expiresAt,
    channel,
    ip,
    userAgent,
    camera: {
      id: device.id,
      uid: device.device_id,
      name: device.device_name,
      homeId: device.home_id,
      gatewayDbId: device.gateway_device_id,
      gatewayUid: device.gateway_uid,
    },
  });
  if (!joined.ok) {
    closeWith(ws, joined.code, joined.reason);
    return;
  }
  viewer = joined.viewer;
}
