// Viewer web → backend: WebSocket `GET /api/portal/cameras/:deviceId/live` (khung JPEG nhị phân + trạng thái JSON).
// Trước upgrade (lỗi → HTTP thô): 60 upgrade/phút/IP (429) → Origin hợp lệ (403, chống CSWSH vì xác thực bằng cookie) → cookie `sh_user` (401).
// Sau upgrade, kiểm quyền rồi đóng bằng mã ứng dụng (trình duyệt không đọc được HTTP status khi upgrade lỗi):
//   4429 quá 10 lần mở/phút · 4404 không tồn tại / không thuộc nhà / không phải camera (không lộ — invariant 6) ·
//   4403 GUEST · 4501 camera mô phỏng · 4408 camera chưa gán gateway · 4409 đủ 4 viewer · 4429 đủ 2 luồng/user.
// Phần kiểm quyền sau upgrade dùng chung với viewer Mobile (live-viewer.run.ts).
// Admin/Operator không có endpoint này (quyền riêng tư): cookie nhân viên không phải `sh_user`. Không log cookie/token.
import type { Application } from "express";
import { WebSocketServer } from "ws";
import { rejectUpgrade, resolveUpgradeClientIp, type UpgradeHandler } from "../../../../core/ws/upgrade-router";
import { HttpError } from "../../../../shared/errors/http-error";
import { authenticatePortalCookie } from "../../../identity";
import { LIVE_CLOSE, LIVE_LIMITS, registerUpgradeAttempt } from "../../domain/live-session";
import { isAllowedViewerOrigin, parseCameraId } from "./live-relay.dto";
import { closeWith, runViewer, type ViewerIdentity } from "./live-viewer.run";

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
    let identity: ViewerIdentity;
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
      void runViewer(ws, identity, "portal", cameraId, ip, userAgent).catch((err: unknown) => {
        console.error("[camera-live] viewer failed:", err instanceof Error ? err.message : "unknown error");
        closeWith(ws, 1011, "internal_error");
      });
    });
  };
}
