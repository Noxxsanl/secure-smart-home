// Viewer web → backend: WebSocket `GET /api/portal/cameras/:deviceId/live` (khung JPEG nhị phân + trạng thái JSON).
// Trước upgrade (lỗi → HTTP thô): 60 upgrade/phút/IP (429) → Origin hợp lệ (403, chống CSWSH vì xác thực bằng cookie) → cookie `sh_user` (401).
// Sau upgrade, kiểm quyền rồi đóng bằng mã ứng dụng (trình duyệt không đọc được HTTP status khi upgrade lỗi):
//   4429 quá 10 lần mở/phút · 4404 không tồn tại / không thuộc nhà / không phải camera (không lộ — invariant 6) ·
//   4403 GUEST · 4501 camera mô phỏng · 4408 camera chưa gán gateway · 4409 đủ 4 viewer · 4429 đủ 2 luồng/user.
// Admin/Operator không có endpoint này (quyền riêng tư): cookie nhân viên không phải `sh_user`. Không log cookie/token.
import type { Application } from "express";
import { WebSocket, WebSocketServer } from "ws";
import { rejectUpgrade, resolveUpgradeClientIp, type UpgradeHandler } from "../../../../core/ws/upgrade-router";
import { HttpError } from "../../../../shared/errors/http-error";
import { requireDeviceAccess } from "../../../devices";
import { authenticatePortalCookie } from "../../../identity";
import { LIVE_CLOSE, LIVE_LIMITS, registerOpenAttempt, registerUpgradeAttempt, type LiveViewer } from "../../domain/live-session";
import { isAllowedViewerOrigin, parseCameraId } from "./live-relay.dto";
import { joinViewer, leaveViewer } from "./live-relay.handler";

type PortalIdentity = Awaited<ReturnType<typeof authenticatePortalCookie>>;

function closeWith(ws: WebSocket, code: number, reason: string): void {
  try {
    ws.close(code, reason);
  } catch {
    ws.terminate();
  }
}

async function runViewer(
  ws: WebSocket,
  identity: PortalIdentity,
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

export function createViewerUpgradeHandler(app: Application): UpgradeHandler {
  const wss = new WebSocketServer({ noServer: true, maxPayload: LIVE_LIMITS.viewerMaxPayloadBytes, perMessageDeflate: false });

  return async ({ req, socket, head, params }) => {
    const ip = resolveUpgradeClientIp(app, req).slice(0, 45);
    // Kiểm NGAY ĐẦU theo IP, trước Origin / đọc cookie / truy vấn DB (10 lần/phút/user chỉ áp sau xác thực)
    if (!registerUpgradeAttempt("viewer", ip, LIVE_LIMITS.maxViewerUpgradesPerMinutePerIp, Date.now())) {
      rejectUpgrade(socket, 429, "RATE_LIMITED");
      return;
    }
    if (!isAllowedViewerOrigin(req)) {
      rejectUpgrade(socket, 403, "ORIGIN_NOT_ALLOWED");
      return;
    }
    let identity: PortalIdentity;
    try {
      identity = await authenticatePortalCookie(req);
    } catch (err) {
      if (err instanceof HttpError) {
        rejectUpgrade(socket, err.status, err.code, err.extra);
        return;
      }
      throw err; // upgrade-router trả 500
    }

    const cameraId = parseCameraId(params[0]);
    const userAgentHeader = req.headers["user-agent"];
    const userAgent = typeof userAgentHeader === "string" && userAgentHeader ? userAgentHeader.slice(0, 255) : null;
    wss.handleUpgrade(req, socket, head, (ws) => {
      if (cameraId === null) {
        closeWith(ws, LIVE_CLOSE.NOT_FOUND, "not_found"); // id ngoài INT4: như không tìm thấy (invariant 6)
        return;
      }
      void runViewer(ws, identity, cameraId, ip, userAgent).catch((err: unknown) => {
        console.error("[camera-live] viewer failed:", err instanceof Error ? err.message : "unknown error");
        closeWith(ws, 1011, "internal_error");
      });
    });
  };
}
