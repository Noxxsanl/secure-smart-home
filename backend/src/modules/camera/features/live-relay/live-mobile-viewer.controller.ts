// Viewer Mobile → backend: WebSocket `GET /api/mobile/cameras/:deviceId/live` (khung JPEG nhị phân + trạng thái JSON, cùng
// nội dung với viewer web; chỉ khác cách xác thực). Không đi qua router Express nên `requireMobileUser` không áp dụng — tự xác thực.
//
// Trước upgrade: chỉ giới hạn 60 upgrade/phút/IP (HTTP 429). KHÔNG kiểm Origin và KHÔNG đọc cookie: Bearer không tự được
// trình duyệt gửi kèm nên không có CSWSH; app Mobile cũng không có Origin.
// Sau upgrade: khung chữ ĐẦU TIÊN phải là {"type":"auth","token":"<access JWT>"} trong 10 s (token không bao giờ nằm trong URL —
// URL hay bị proxy ghi log). JSON hỏng / sai type / khung nhị phân / token sai-hết hạn / quá 10 s → đóng 4401 (client refresh rồi
// nối lại). Xác thực xong chạy lại nguyên logic viewer web (live-viewer.run.ts): 4429 · 4404 · 4403 · 4501 · 4408 · 4409.
// Socket chưa xác thực không tốn truy vấn DB: authenticateAccessToken kiểm chữ ký JWT trước, chỉ token hợp lệ mới chạm DB.
// Không log token / khung (invariant 2).
import type { Application } from "express";
import type { RawData } from "ws";
import { WebSocket, WebSocketServer } from "ws";
import { rejectUpgrade, resolveUpgradeClientIp, type UpgradeHandler } from "../../../../core/ws/upgrade-router";
import { HttpError } from "../../../../shared/errors/http-error";
import { authenticateAccessToken } from "../../../identity";
import { LIVE_CLOSE, LIVE_LIMITS, registerUpgradeAttempt } from "../../domain/live-session";
import { parseAuthFrame, parseCameraId } from "./live-relay.dto";
import { closeWith, runViewer } from "./live-viewer.run";

function rawToText(data: RawData): string {
  if (Buffer.isBuffer(data)) return data.toString("utf8");
  if (Array.isArray(data)) return Buffer.concat(data).toString("utf8");
  return Buffer.from(data).toString("utf8");
}

/** Chờ khung auth rồi giao socket cho runViewer. Mọi lỗi xác thực → 4401; hẹn giờ 10 s luôn được huỷ khi socket đóng. */
function awaitAuth(ws: WebSocket, cameraId: number | null, ip: string, userAgent: string | null): void {
  const authTimer = setTimeout(() => closeWith(ws, LIVE_CLOSE.UNAUTHORIZED, "auth_timeout"), LIVE_LIMITS.mobileAuthTimeoutMs);
  authTimer.unref();
  ws.on("close", () => clearTimeout(authTimer));
  ws.on("error", () => {
    // lỗi socket kéo theo "close" (huỷ hẹn giờ); không log để khỏi lộ nội dung
  });

  // once: chỉ khung đầu tiên có nghĩa; khung sau (nếu đến khi đang kiểm token) không có listener nên bị bỏ qua,
  // runViewer sau đó gắn listener bỏ qua tin client.
  ws.once("message", (data: RawData, isBinary: boolean) => {
    clearTimeout(authTimer);
    const token = isBinary ? null : parseAuthFrame(rawToText(data));
    if (token === null) {
      closeWith(ws, LIVE_CLOSE.UNAUTHORIZED, "auth_required");
      return;
    }
    void authenticateAccessToken(token)
      .then(({ auth, expiresAt, tokenVersion }) => {
        if (ws.readyState !== WebSocket.OPEN) return; // client đã đi trong lúc kiểm token
        if (cameraId === null) {
          closeWith(ws, LIVE_CLOSE.NOT_FOUND, "not_found"); // id ngoài INT4: như không tìm thấy (invariant 6)
          return;
        }
        return runViewer(ws, { auth, tokenVersion, expiresAt }, "mobile", cameraId, ip, userAgent);
      })
      .catch((err: unknown) => {
        if (err instanceof HttpError) {
          // token sai / hết hạn / thu hồi / tài khoản khoá / nhân viên cầm access token → 4401
          closeWith(ws, LIVE_CLOSE.UNAUTHORIZED, "invalid_token");
          return;
        }
        console.error("[camera-live] mobile viewer failed:", err instanceof Error ? err.message : "unknown error");
        closeWith(ws, 1011, "internal_error");
      });
  });
}

export function createMobileViewerUpgradeHandler(app: Application): UpgradeHandler {
  const wss = new WebSocketServer({ noServer: true, maxPayload: LIVE_LIMITS.mobileViewerMaxPayloadBytes, perMessageDeflate: false });

  return ({ req, socket, head, params }) => {
    const ip = resolveUpgradeClientIp(app, req).slice(0, 45);
    // Kiểm NGAY ĐẦU theo IP, trước mọi xử lý khác (bucket riêng với viewer web)
    if (!registerUpgradeAttempt("mobile_viewer", ip, LIVE_LIMITS.maxViewerUpgradesPerMinutePerIp, Date.now())) {
      rejectUpgrade(socket, 429, "RATE_LIMITED");
      return;
    }
    const cameraId = parseCameraId(params[0]);
    const userAgentHeader = req.headers["user-agent"];
    const userAgent = typeof userAgentHeader === "string" && userAgentHeader ? userAgentHeader.slice(0, 255) : null;
    wss.handleUpgrade(req, socket, head, (ws) => awaitAuth(ws, cameraId, ip, userAgent));
  };
}
