// Vòng đời phiên xem trực tiếp camera (FR-5.8): relay khung JPEG gateway → backend → web, CHỈ trong RAM.
//
//   Viewer đầu tiên mở → tạo phiên (session_id = UUID v4) + publish MQTT `live_start` (control.publishSessionCommand);
//   chưa có uplink sau 10 s → gửi lại live_start 1 lần; sau 20 s vẫn không có → viewer nhận state camera_unavailable
//   rồi bị đóng 4408 và phiên bị xoá (kèm live_stop). Viewer cuối rời → chờ 10 s → live_stop + đóng uplink (1000) + xoá phiên.
//   Uplink rớt → viewer nhận state reconnecting, chờ 15 s cho gateway nối lại cùng session; quá hạn → 4408.
//
// Một ticker toàn cục 1 s (chỉ chạy khi có phiên) lo mọi mốc thời gian + ping viewer + kiểm lại quyền viewer 30 s/lần,
// thay vì mỗi phiên một nhóm setTimeout — ít timer, ít chỗ rò. Không ghi khung xuống đĩa; không log session_id,
// token, chữ ký (invariant 2). Controller (live-viewer / live-uplink) xác thực rồi gọi các hàm ở đây.
import { WebSocket } from "ws";
import type { RawData } from "ws";
import { newUuid } from "../../../../shared/crypto";
import { logEvent } from "../../../audit";
import { requireDeviceAccess } from "../../../devices";
import { publishSessionCommand } from "../../../control";
import { findAuthUserById } from "../../../identity";
import type { AuthContext } from "../../../../core/auth/auth-context";
import {
  LIVE_CLOSE,
  LIVE_LIMITS,
  countUserStreams,
  getSessionByCamera,
  listSessions,
  pruneOpenAttempts,
  putSession,
  removeSession,
  type LiveSession,
  type LiveState,
  type LiveUplink,
  type LiveViewer,
} from "../../domain/live-session";

let ticker: NodeJS.Timeout | null = null;
let lastPruneAt = 0;

// ── Gửi cho viewer ──────────────────────────────────────────────────────────

function sendState(viewer: LiveViewer, state: LiveState): void {
  if (viewer.ws.readyState !== WebSocket.OPEN) return;
  viewer.ws.send(JSON.stringify({ type: "state", state }), () => undefined);
}

function setState(session: LiveSession, state: LiveState): void {
  if (session.state === state) return;
  session.state = state;
  for (const viewer of session.viewers) sendState(viewer, state);
}

/** Chuyển nguyên vẹn một khung JPEG; viewer chậm (bufferedAmount > 256 KB) thì bỏ khung — luôn giữ khung mới nhất. */
function sendFrame(viewer: LiveViewer, frame: Buffer): void {
  if (viewer.ws.readyState !== WebSocket.OPEN) return;
  if (viewer.ws.bufferedAmount > LIVE_LIMITS.maxBufferedBytes) return;
  viewer.ws.send(frame, { binary: true, compress: false }, () => undefined);
}

function closeWs(ws: WebSocket, code: number, text: string): void {
  try {
    ws.close(code, text);
  } catch {
    ws.terminate();
  }
}

// ── Lệnh MQTT tới gateway ───────────────────────────────────────────────────

/** live_start / live_stop (command_id = session_id, ký HMAC gateway). Không chờ ack; lỗi chỉ ghi cảnh báo chung chung. */
function sendLiveCommand(session: LiveSession, action: "live_start" | "live_stop"): void {
  void publishSessionCommand({
    homeId: session.homeId,
    gatewayDbId: session.gatewayDbId,
    gatewayUid: session.gatewayUid,
    deviceUid: session.cameraUid,
    commandId: session.sessionId,
    action,
  }).then((ok) => {
    if (!ok) console.warn(`[camera-live] ${action} was not published (broker or gateway unavailable)`);
    else console.log(`[camera-live] ${action} sent: camera ${session.cameraUid} via gateway ${session.gatewayUid} (home ${session.homeId})`);
  });
}

// ── Viewer rời / kết thúc phiên ─────────────────────────────────────────────

function auditEnd(viewer: LiveViewer, reason: string): void {
  const session = viewer.session;
  const durationS = Math.max(0, Math.round((Date.now() - viewer.joinedAt) / 1000));
  void logEvent({
    eventType: "CAMERA_LIVE_VIEW_END",
    message: `Kết thúc xem trực tiếp camera "${session.cameraName}" (${durationS} giây)`,
    homeId: session.homeId,
    deviceId: session.cameraId,
    actorUserId: viewer.userId,
    ip: viewer.ip,
    userAgent: viewer.userAgent,
    details: { duration_s: durationS, reason },
  });
}

/** Bỏ viewer khỏi phiên + audit END (1 lần). Viewer cuối rời → bắt đầu đếm idle 10 s. Không đóng socket. */
export function leaveViewer(viewer: LiveViewer, reason: string): void {
  if (viewer.ended) return;
  viewer.ended = true;
  const session = viewer.session;
  session.viewers.delete(viewer);
  auditEnd(viewer, reason);
  if (session.viewers.size === 0 && !session.destroyed) session.idleSince = Date.now();
}

function closeViewer(viewer: LiveViewer, code: number, reason: string): void {
  leaveViewer(viewer, reason);
  closeWs(viewer.ws, code, reason);
}

/** Xoá phiên: audit END + đóng mọi viewer, live_stop, đóng uplink 1000. Idempotent. */
function destroySession(session: LiveSession, reason: string, viewerCode: number = LIVE_CLOSE.NORMAL): void {
  if (session.destroyed) return;
  session.destroyed = true;
  console.log(`[camera-live] session ended: camera ${session.cameraUid} (${reason})`);
  removeSession(session);
  for (const viewer of [...session.viewers]) closeViewer(viewer, viewerCode, reason);
  const uplink = session.uplink;
  session.uplink = null;
  if (uplink) closeWs(uplink.ws, LIVE_CLOSE.NORMAL, "session_ended");
  session.lastFrame = null;
  sendLiveCommand(session, "live_stop");
  stopTickerIfIdle();
}

/** Camera không phản hồi: báo camera_unavailable cho viewer, đóng 4408, xoá phiên. */
function failSession(session: LiveSession, reason: string): void {
  setState(session, "camera_unavailable");
  destroySession(session, reason, LIVE_CLOSE.CAMERA_TIMEOUT);
}

/** Đóng mọi phiên (server tắt). */
export function closeAllLiveSessions(): void {
  for (const session of listSessions()) destroySession(session, "server_shutdown", 1001);
}

// ── Viewer vào ──────────────────────────────────────────────────────────────

export interface JoinViewerInput {
  ws: WebSocket;
  auth: AuthContext;
  tokenVersion: number;
  expiresAt: Date;
  ip: string | null;
  userAgent: string | null;
  camera: { id: number; uid: string; name: string; homeId: number; gatewayDbId: number; gatewayUid: string };
}

export type JoinViewerResult = { ok: true; viewer: LiveViewer } | { ok: false; code: number; reason: string };

/**
 * ĐỒNG BỘ (không await) để kiểm giới hạn + tạo phiên không bị chen giữa hai viewer cùng lúc.
 * Giới hạn: 2 luồng/user (4429), 4 viewer/camera (4409). Viewer đầu tiên tạo phiên + live_start.
 */
export function joinViewer(input: JoinViewerInput): JoinViewerResult {
  const now = Date.now();
  if (countUserStreams(input.auth.userId) >= LIVE_LIMITS.maxStreamsPerUser) {
    return { ok: false, code: LIVE_CLOSE.RATE_LIMITED, reason: "too_many_streams" };
  }
  let session = getSessionByCamera(input.camera.id);
  if (session && session.viewers.size >= LIVE_LIMITS.maxViewersPerCamera) {
    return { ok: false, code: LIVE_CLOSE.FULL, reason: "camera_full" };
  }

  let created = false;
  if (!session) {
    session = {
      sessionId: newUuid(),
      cameraId: input.camera.id,
      cameraUid: input.camera.uid,
      cameraName: input.camera.name,
      gatewayDbId: input.camera.gatewayDbId,
      gatewayUid: input.camera.gatewayUid,
      homeId: input.camera.homeId,
      viewers: new Set(),
      uplink: null,
      lastFrame: null,
      lastFrameAt: 0,
      state: "connecting",
      startedAt: now,
      startRetried: false,
      reconnectingSince: null,
      idleSince: null,
      destroyed: false,
    };
    putSession(session);
    created = true;
  }

  const viewer: LiveViewer = {
    session,
    ws: input.ws,
    userId: input.auth.userId,
    auth: input.auth,
    tokenVersion: input.tokenVersion,
    expiresAt: input.expiresAt,
    ip: input.ip,
    userAgent: input.userAgent,
    joinedAt: now,
    lastPingAt: now,
    lastCheckAt: now,
    alive: true,
    checking: false,
    ended: false,
  };
  // Viewer vào phiên đang idle (viewers 0 → 1) mà chưa có uplink: các mốc chờ tính từ lúc idle sẽ làm viewer bị 4408
  // gần như ngay → đặt lại mốc, và gửi lại live_start nếu lần gửi trước đã quá lâu để chắc gateway nhận lệnh.
  if (!created && session.viewers.size === 0 && !session.uplink) {
    const stale = now - session.startedAt >= LIVE_LIMITS.startRetryMs;
    session.startedAt = now;
    session.startRetried = false;
    if (session.reconnectingSince !== null) session.reconnectingSince = now;
    if (stale) sendLiveCommand(session, "live_start");
  }
  session.viewers.add(viewer);
  session.idleSince = null;

  // Viewer mới: trạng thái hiện tại, rồi khung cuối nếu còn tươi (< 2 s) để khỏi chờ khung kế tiếp
  sendState(viewer, session.state);
  if (session.lastFrame && now - session.lastFrameAt < LIVE_LIMITS.lastFrameMaxAgeMs) sendFrame(viewer, session.lastFrame);

  console.log(
    `[camera-live] viewer joined camera ${session.cameraUid} (${session.viewers.size} viewer(s), ${created ? "new session" : `state ${session.state}`})`
  );
  if (created) {
    ensureTicker();
    sendLiveCommand(session, "live_start");
  }
  void logEvent({
    eventType: "CAMERA_LIVE_VIEW_START",
    message: `Bắt đầu xem trực tiếp camera "${session.cameraName}"`,
    homeId: session.homeId,
    deviceId: session.cameraId,
    actorUserId: viewer.userId,
    ip: viewer.ip,
    userAgent: viewer.userAgent,
    details: { channel: "portal" },
  });
  return { ok: true, viewer };
}

// ── Uplink gateway ──────────────────────────────────────────────────────────

/**
 * Uplink mới có được thay uplink hiện tại không: chưa có uplink, hoặc uplink cũ đã im (không nhận tin nào)
 * ≥ uplinkReplaceSilenceMs. Chữ ký uplink dùng lại được trong ±300 s, nên nếu thay vô điều kiện thì replay sẽ
 * chiếm được uplink thật đang chạy; nhưng gateway nối lại khi kết nối cũ nửa mở (TCP) thì cũ im nhanh → vẫn thay được.
 */
export function canReplaceUplink(session: LiveSession, now: number): boolean {
  const previous = session.uplink;
  return previous === null || now - previous.lastMessageAt >= LIVE_LIMITS.uplinkReplaceSilenceMs;
}

/**
 * Nhận uplink đã xác thực cho phiên; false (không gắn, bên gọi tự đóng ws) nếu uplink cũ còn hoạt động. Nếu uplink
 * cũ đã im ≥ 3 s thì thay bằng uplink mới: giữ bất biến "uplink ≤ 1" mà gateway không kẹt tới khi quá 15 s im lặng.
 */
export function attachUplink(session: LiveSession, ws: WebSocket): boolean {
  const now = Date.now();
  if (!canReplaceUplink(session, now)) return false;
  const previous = session.uplink;
  const uplink: LiveUplink = { ws, attachedAt: now, lastMessageAt: now, ended: false, windowStart: now, windowCount: 0 };
  session.uplink = uplink;
  session.reconnectingSince = null;
  if (previous) previous.ws.terminate(); // close handler của uplink cũ bỏ qua vì session.uplink đã là uplink mới

  ws.on("message", (data: RawData, isBinary: boolean) => onUplinkMessage(session, uplink, data, isBinary));
  ws.on("close", (code: number) => {
    console.log(`[camera-live] uplink closed: camera ${session.cameraUid} (code ${code}${uplink.ended ? ", gateway sent end" : ""})`);
    onUplinkClosed(session, uplink);
  });
  ws.on("error", () => {
    // lỗi socket kéo theo "close"; không log để khỏi lộ nội dung
  });
  return true;
}

function toBuffer(data: RawData): Buffer {
  if (Buffer.isBuffer(data)) return data;
  if (Array.isArray(data)) return Buffer.concat(data);
  return Buffer.from(data);
}

function onUplinkMessage(session: LiveSession, uplink: LiveUplink, data: RawData, isBinary: boolean): void {
  if (session.destroyed || session.uplink !== uplink) return;
  const now = Date.now();
  uplink.lastMessageAt = now;
  const buf = toBuffer(data);

  if (!isBinary) {
    onUplinkText(session, uplink, buf);
    return;
  }

  // Khung JPEG: bắt đầu FF D8, ≤ 200 KB, ≤ 25 khung/s (thừa thì bỏ). Khung sai → bỏ, không đóng kết nối.
  if (buf.length < 4 || buf.length > LIVE_LIMITS.maxFrameBytes || buf[0] !== 0xff || buf[1] !== 0xd8) return;
  if (now - uplink.windowStart >= 1000) {
    uplink.windowStart = now;
    uplink.windowCount = 0;
  }
  if (uplink.windowCount >= LIVE_LIMITS.maxFramesPerSecond) return;
  uplink.windowCount++;

  if (session.lastFrameAt < uplink.attachedAt) {
    console.log(`[camera-live] first frame from camera ${session.cameraUid} (${buf.length} bytes)`);
  }
  session.lastFrame = buf;
  session.lastFrameAt = now;
  session.reconnectingSince = null;
  setState(session, "live");
  for (const viewer of session.viewers) sendFrame(viewer, buf);
}

function onUplinkText(session: LiveSession, uplink: LiveUplink, buf: Buffer): void {
  let message: unknown;
  try {
    message = JSON.parse(buf.toString("utf8"));
  } catch {
    return;
  }
  if (typeof message !== "object" || message === null) return;
  const { type, state } = message as { type?: unknown; state?: unknown };
  if (type === "end") {
    uplink.ended = true;
    return;
  }
  if (type !== "status") return;
  if (typeof state === "string" && /^[a-z_]{1,32}$/.test(state)) {
    console.log(`[camera-live] gateway status for camera ${session.cameraUid}: ${state}`);
  }
  if (state === "camera_unavailable") {
    setState(session, "camera_unavailable");
  } else if (state === "connecting") {
    // Đang chạy mà gateway nối lại camera → "reconnecting"; chưa có khung nào → "connecting"
    setState(session, session.state === "live" ? "reconnecting" : "connecting");
  }
  // "streaming": trạng thái live do khung đầu tiên quyết định
}

function onUplinkClosed(session: LiveSession, uplink: LiveUplink): void {
  if (session.uplink !== uplink) return; // đã bị thay hoặc phiên đã xoá
  session.uplink = null;
  if (session.destroyed) return;
  if (uplink.ended) {
    // Gateway chủ động kết thúc (vd mất camera): không chờ nối lại
    failSession(session, "gateway_ended");
    return;
  }
  // Rớt kết nối: giữ phiên chờ gateway nối lại cùng session_id
  session.reconnectingSince = Date.now();
  if (session.viewers.size > 0) setState(session, "reconnecting");
}

// ── Ticker: mốc thời gian, ping, kiểm lại quyền ─────────────────────────────

function ensureTicker(): void {
  if (ticker) return;
  ticker = setInterval(tick, 1000);
  ticker.unref();
}

function stopTickerIfIdle(): void {
  if (ticker && listSessions().length === 0) {
    clearInterval(ticker);
    ticker = null;
  }
}

function tick(): void {
  const now = Date.now();
  for (const session of listSessions()) {
    try {
      tickSession(session, now);
    } catch (err) {
      console.error("[camera-live] tick failed:", err instanceof Error ? err.message : "unknown error");
    }
  }
  if (now - lastPruneAt >= 60_000) {
    lastPruneAt = now;
    pruneOpenAttempts(now);
  }
  stopTickerIfIdle();
}

function tickSession(session: LiveSession, now: number): void {
  if (session.destroyed) return;

  if (session.viewers.size === 0) {
    if (session.idleSince !== null && now - session.idleSince >= LIVE_LIMITS.idleStopMs) destroySession(session, "idle");
    return;
  }

  const uplink = session.uplink;
  if (uplink) {
    if (now - uplink.lastMessageAt >= LIVE_LIMITS.uplinkSilenceMs) {
      // Im lặng 15 s: cắt không gửi close frame để gateway coi là rớt mạng và nối lại; close handler đưa phiên sang reconnecting
      console.warn(`[camera-live] uplink silent for ${LIVE_LIMITS.uplinkSilenceMs / 1000}s: camera ${session.cameraUid} — dropping it`);
      uplink.ws.terminate();
    } else if (now - Math.max(session.lastFrameAt, uplink.attachedAt) >= LIVE_LIMITS.unavailableMs) {
      // Uplink còn nhưng 20 s không có khung (camera hỏng/ngắt): kết thúc như camera không phản hồi
      failSession(session, "no_frames");
      return;
    }
  } else if (session.reconnectingSince !== null) {
    if (now - session.reconnectingSince >= LIVE_LIMITS.reconnectGraceMs) {
      failSession(session, "uplink_lost");
      return;
    }
  } else {
    if (!session.startRetried && now - session.startedAt >= LIVE_LIMITS.startRetryMs) {
      session.startRetried = true;
      sendLiveCommand(session, "live_start");
    }
    if (now - session.startedAt >= LIVE_LIMITS.unavailableMs) {
      failSession(session, "camera_unavailable");
      return;
    }
  }

  for (const viewer of [...session.viewers]) {
    if (now - viewer.lastPingAt >= LIVE_LIMITS.pingMs) {
      if (!viewer.alive) {
        leaveViewer(viewer, "ping_timeout");
        viewer.ws.terminate();
        continue;
      }
      viewer.alive = false;
      viewer.lastPingAt = now;
      try {
        viewer.ws.ping();
      } catch {
        leaveViewer(viewer, "ping_timeout");
        viewer.ws.terminate();
        continue;
      }
    }
    if (!viewer.checking && now - viewer.lastCheckAt >= LIVE_LIMITS.recheckMs) void recheckViewer(viewer);
  }
}

/**
 * Kiểm lại viewer mỗi 30 s: cookie hết hạn / token_version đổi / tài khoản khoá → 4401; mất quyền xem camera,
 * bị hạ thành GUEST, camera chuyển nhà → 4403. Lỗi tạm (DB) bỏ qua, thử lại chu kỳ sau.
 */
async function recheckViewer(viewer: LiveViewer): Promise<void> {
  viewer.checking = true;
  try {
    const user = await findAuthUserById(viewer.userId);
    if (
      !user ||
      user.status === "locked" ||
      Number(user.token_version) !== viewer.tokenVersion ||
      viewer.expiresAt.getTime() <= Date.now()
    ) {
      closeViewer(viewer, LIVE_CLOSE.UNAUTHORIZED, "session_revoked");
      return;
    }
    try {
      const { device, access } = await requireDeviceAccess(viewer.auth, viewer.session.cameraId, "view");
      if (access.role === "GUEST" || device.category !== "camera" || device.home_id !== viewer.session.homeId) {
        closeViewer(viewer, LIVE_CLOSE.FORBIDDEN, "permission_lost");
      }
    } catch (err) {
      const status = (err as { status?: unknown }).status;
      if (status === 403 || status === 404) closeViewer(viewer, LIVE_CLOSE.FORBIDDEN, "permission_lost");
      // lỗi khác (DB tạm thời): giữ viewer, kiểm lại lần sau
    }
  } catch (err) {
    console.error("[camera-live] viewer recheck failed:", err instanceof Error ? err.message : "unknown error");
  } finally {
    viewer.checking = false;
    viewer.lastCheckAt = Date.now();
  }
}
