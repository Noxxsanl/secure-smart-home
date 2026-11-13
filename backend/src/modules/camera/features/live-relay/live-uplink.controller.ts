// Uplink gateway → backend: WebSocket `GET /api/device/camera/live` (khung JPEG nhị phân + trạng thái JSON).
// Xác thực TRƯỚC khi upgrade, dùng chung camera/domain/gateway-auth.ts với POST /snapshot (bất biến 4: một logic):
//   header (400) → gateway tồn tại (401) → ts ±300 s (401) → gateway/camera hợp lệ (403/404) → HMAC (401)
//   → phiên tồn tại và khớp camera + gateway (404 LIVE_SESSION_NOT_FOUND)
//   → uplink cũ còn hoạt động (có tin < 3 s) thì từ chối uplink mới (409 LIVE_UPLINK_BUSY).
// Trước tất cả: giới hạn 30 upgrade/phút/IP (429) — upgrade không đi qua rate limit của Express.
// Lỗi → phản hồi HTTP thô rồi đóng socket (core/ws/upgrade-router.ts). Không log chữ ký/secret/session_id.
// Uplink thứ hai chỉ thay được uplink cũ khi cũ đã im ≥ 3 s — lý do ở attachUplink (live-relay.handler.ts).
import type { Application } from "express";
import { WebSocketServer } from "ws";
import { rejectUpgrade, resolveUpgradeClientIp, type UpgradeHandler } from "../../../../core/ws/upgrade-router";
import { HttpError } from "../../../../shared/errors/http-error";
import { precheckGatewayCamera, verifyGatewaySignature } from "../../domain/gateway-auth";
import { LIVE_LIMITS, findSessionById, registerUpgradeAttempt, type LiveSession } from "../../domain/live-session";
import { UPLINK_AUTH_SOURCE, buildUplinkSigningString, parseUplinkHeaders } from "./live-relay.dto";
import { attachUplink, canReplaceUplink } from "./live-relay.handler";

export function createUplinkUpgradeHandler(app: Application): UpgradeHandler {
  // maxPayload 256 KB > khung tối đa 200 KB: khung quá cỡ bị bỏ ở handler thay vì làm rớt kết nối
  const wss = new WebSocketServer({ noServer: true, maxPayload: LIVE_LIMITS.uplinkMaxPayloadBytes, perMessageDeflate: false });

  return async ({ req, socket, head }) => {
    const ip = resolveUpgradeClientIp(app, req).slice(0, 45);
    // Kiểm NGAY ĐẦU, trước parse header và truy vấn DB
    if (!registerUpgradeAttempt("uplink", ip, LIVE_LIMITS.maxUplinkUpgradesPerMinutePerIp, Date.now())) {
      console.warn(`[camera-live] uplink from ${ip} rejected: 429 RATE_LIMITED`);
      rejectUpgrade(socket, 429, "RATE_LIMITED");
      return;
    }
    const userAgentHeader = req.headers["user-agent"];
    const meta = { ip, userAgent: typeof userAgentHeader === "string" && userAgentHeader ? userAgentHeader.slice(0, 255) : null };

    let session: LiveSession;
    try {
      const headers = parseUplinkHeaders(req);
      const { gateway, camera } = await precheckGatewayCamera(
        meta,
        UPLINK_AUTH_SOURCE,
        headers.gatewayUid,
        headers.cameraUid,
        headers.timestamp
      );
      await verifyGatewaySignature(
        meta,
        UPLINK_AUTH_SOURCE,
        headers.gatewayUid,
        gateway.id,
        buildUplinkSigningString(headers),
        headers.signature
      );
      const found = findSessionById(headers.sessionId);
      if (!found || found.destroyed || found.cameraId !== camera.id || found.gatewayDbId !== gateway.id) {
        throw new HttpError(404, "LIVE_SESSION_NOT_FOUND", "No active live session for this camera");
      }
      if (!canReplaceUplink(found, Date.now())) {
        throw new HttpError(409, "LIVE_UPLINK_BUSY", "Live uplink is already active for this session");
      }
      session = found;
    } catch (err) {
      if (err instanceof HttpError) {
        // Chỉ mã lỗi + IP — không log header (chữ ký, session_id)
        console.warn(`[camera-live] uplink from ${ip} rejected: ${err.status} ${err.code}`);
        rejectUpgrade(socket, err.status, err.code, err.extra);
        return;
      }
      throw err; // upgrade-router trả 500
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      // Phiên có thể vừa bị xoá trong lúc bắt tay
      if (session.destroyed) {
        ws.close(1000, "session_ended");
        return;
      }
      // Kiểm lại vì uplink khác có thể vừa gắn xong trong lúc bắt tay
      if (!attachUplink(session, ws)) {
        ws.close(1008, "uplink_busy");
        return;
      }
      console.log(`[camera-live] uplink connected: camera ${session.cameraUid} via gateway ${session.gatewayUid}`);
    });
  };
}
