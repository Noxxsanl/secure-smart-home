// WebSocket hub cho Mobile (CONTRACT_V2 §4.3, invariant 7: mobile không nối MQTT trực tiếp).
// main.ts gọi attachWsHub(server, app) sau khi server đã listen.
//
// Giao thức:
//   - client mở `GET /api/mobile/ws`, khung ĐẦU TIÊN trong 10 s phải là { type:"auth", token } — token
//     không bao giờ nằm trong URL (URL hay bị log bởi proxy). Hợp lệ → { type:"auth_ok", user_id, home_ids }.
//   - sai/thiếu/quá hạn 10 s, hoặc access token hết hạn giữa chừng → đóng với mã 4401 (client refresh rồi nối lại).
//   - server ping 30 s; connection không trả pong sau 1 chu kỳ bị terminate.
//   - sự kiện bus được lọc THEO TỪNG CONNECTION: chỉ nhà mà user là thành viên hiệu lực; GUEST chỉ thấy
//     thiết bị được phép; `notification` chỉ tới đúng user_id.
// Token và nội dung khung không bao giờ được log (invariant 2).
import type { Application } from "express";
import type { IncomingMessage, Server } from "http";
import type { Duplex } from "stream";
import { WebSocketServer, WebSocket } from "ws";
import { eventBus, type HomeChangedEvent } from "../../../../shared/events/event-bus";
import { listEffectiveMemberUserIds } from "../../../homes";
import { authenticateAccessToken, findAuthUserById } from "../../../identity";
import { loadHomes, refreshHomes } from "../../domain/home-scope";
import {
  AUTH_TIMEOUT_MS,
  HOME_REFRESH_INTERVAL_MS,
  MAX_AUTH_PER_USER,
  MAX_FRAME_BYTES,
  MAX_TIMER_MS,
  MAX_UNAUTH_PER_IP,
  PING_INTERVAL_MS,
  WS_PATH,
  canSeeDevice,
  type Connection,
} from "../../domain/ws-connection";
import {
  authedConnections,
  clearTimers,
  closeTooMany,
  closeUnauthorized,
  connections,
  send,
} from "../../infrastructure/connection-registry";

async function handleAuthFrame(conn: Connection, raw: string): Promise<void> {
  let token: string | null = null;
  try {
    const frame: unknown = JSON.parse(raw);
    if (typeof frame === "object" && frame !== null) {
      const { type, token: candidate } = frame as { type?: unknown; token?: unknown };
      if (type === "auth" && typeof candidate === "string" && candidate.length > 0 && candidate.length <= 2048) {
        token = candidate;
      }
    }
  } catch {
    // khung không phải JSON → token vẫn null
  }
  if (token === null) {
    closeUnauthorized(conn, "AUTH_REQUIRED");
    return;
  }

  try {
    const { auth, expiresAt, tokenVersion } = await authenticateAccessToken(token);
    if (conn.ws.readyState !== WebSocket.OPEN) return;
    // Tối đa MAX_AUTH_PER_USER kết nối đã xác thực / user (kết nối này chưa được tính vì userId còn null)
    let existing = 0;
    for (const other of connections) if (other.userId === auth.userId) existing++;
    if (existing >= MAX_AUTH_PER_USER) {
      closeTooMany(conn, "TOO_MANY_CONNECTIONS");
      return;
    }
    conn.userId = auth.userId;
    conn.tokenVersion = tokenVersion;
    conn.homes = await loadHomes(auth.userId);
    if (conn.ws.readyState !== WebSocket.OPEN) return;

    if (conn.authTimer) clearTimeout(conn.authTimer);
    conn.authTimer = null;
    // Hết hạn access token → đóng 4401 để client refresh rồi nối lại (CONTRACT §4.3)
    const remaining = Math.min(Math.max(expiresAt.getTime() - Date.now(), 0), MAX_TIMER_MS);
    conn.expiryTimer = setTimeout(() => closeUnauthorized(conn, "TOKEN_EXPIRED"), remaining);
    conn.expiryTimer.unref();

    send(conn, { type: "auth_ok", user_id: auth.userId, home_ids: [...conn.homes.keys()] });
  } catch {
    closeUnauthorized(conn, "INVALID_TOKEN");
  }
}

function onConnection(ws: WebSocket, ip: string): void {
  const conn: Connection = {
    ws,
    ip,
    tokenVersion: -1,
    userId: null,
    homes: new Map(),
    alive: true,
    authTimer: null,
    expiryTimer: null,
    refreshing: null,
  };
  // Giới hạn kết nối chưa xác thực theo IP (đếm trước khi thêm kết nối này)
  let unauthFromIp = 0;
  for (const other of connections) if (other.userId === null && other.ip === ip) unauthFromIp++;
  if (unauthFromIp >= MAX_UNAUTH_PER_IP) {
    closeTooMany(conn, "TOO_MANY_CONNECTIONS");
    return;
  }
  connections.add(conn);

  conn.authTimer = setTimeout(() => closeUnauthorized(conn, "AUTH_TIMEOUT"), AUTH_TIMEOUT_MS);
  conn.authTimer.unref();

  let receivedFirstFrame = false;
  ws.on("message", (data) => {
    // Chỉ khung đầu tiên có ý nghĩa (auth); sau đó client không cần gửi gì — bỏ qua
    if (receivedFirstFrame) return;
    receivedFirstFrame = true;
    void handleAuthFrame(conn, data.toString());
  });
  ws.on("pong", () => {
    conn.alive = true;
  });
  ws.on("close", () => {
    clearTimers(conn);
    connections.delete(conn);
  });
  ws.on("error", () => {
    // lỗi socket (reset…) sẽ kéo theo "close"; không log để khỏi lộ nội dung
  });
}

// ── Phân phối sự kiện bus ──────────────────────────────────────────────────

async function handleHomeChanged(event: HomeChangedEvent): Promise<void> {
  const holders = authedConnections().filter((conn) => conn.homes.has(event.home_id));
  let targets: Connection[];
  if (event.user_ids !== undefined) {
    const ids = new Set(event.user_ids);
    targets = authedConnections().filter((conn) => conn.userId !== null && ids.has(conn.userId));
  } else {
    // Báo mọi thành viên hiện tại (kể cả người MỚI vào — chưa có nhà này trong tập) và những ai đang giữ nhà
    const memberIds = new Set(await listEffectiveMemberUserIds(event.home_id));
    const byMember = authedConnections().filter((conn) => conn.userId !== null && memberIds.has(conn.userId));
    targets = [...new Set([...holders, ...byMember])];
  }
  await Promise.all(targets.map((conn) => refreshHomes(conn)));
  for (const conn of targets) send(conn, { type: "home_changed", home_id: event.home_id });
}

function attachBusListeners(): void {
  eventBus.on("device_state", (event) => {
    for (const conn of authedConnections()) {
      const scope = conn.homes.get(event.home_id);
      if (scope && canSeeDevice(scope, event.device.id)) {
        send(conn, { type: "device_state", home_id: event.home_id, device: event.device });
      }
    }
  });

  eventBus.on("telemetry", (event) => {
    for (const conn of authedConnections()) {
      const scope = conn.homes.get(event.home_id);
      if (scope && canSeeDevice(scope, event.device_id)) {
        send(conn, {
          type: "telemetry",
          home_id: event.home_id,
          room_id: event.room_id,
          device_id: event.device_id,
          reading: event.reading,
        });
      }
    }
  });

  eventBus.on("notification", (event) => {
    // Thông báo là của riêng từng người nhận → chỉ gửi đúng user_id, không phụ thuộc tập nhà
    for (const conn of authedConnections()) {
      if (conn.userId === event.user_id) {
        send(conn, { type: "notification", home_id: event.home_id, notification: event.notification });
      }
    }
  });

  eventBus.on("home_changed", (event) => handleHomeChanged(event));
}

/**
 * IP client theo đúng cấu hình `trust proxy` của Express: dựng object kế thừa `app.request` (getter `ip`
 * dùng `trust proxy fn` của app) từ request nâng cấp, nên không tin X-Forwarded-For khi TRUST_PROXY=false.
 */
function resolveClientIp(app: Application, req: IncomingMessage): string {
  try {
    const fake = Object.create((app as unknown as { request: object }).request, { headers: { value: req.headers }, socket: { value: req.socket } }) as { ip?: string };
    return fake.ip || req.socket.remoteAddress || "unknown";
  } catch {
    return req.socket.remoteAddress || "unknown";
  }
}

async function closeRevokedSessions(): Promise<void> {
  const byUser = new Map<number, Connection[]>();
  for (const conn of authedConnections()) {
    if (conn.userId === null) continue;
    byUser.set(conn.userId, [...(byUser.get(conn.userId) ?? []), conn]);
  }
  for (const [userId, conns] of byUser) {
    try {
      const user = await findAuthUserById(userId);
      for (const conn of conns) {
        if (!user || user.status === "locked" || Number(user.token_version) !== conn.tokenVersion) {
          closeUnauthorized(conn, "SESSION_REVOKED");
        }
      }
    } catch (err) {
      console.error("[wsHub] session check failed:", err instanceof Error ? err.message : "unknown error");
    }
  }
}

export function attachWsHub(server: Server, app: Application): void {
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_FRAME_BYTES });
  wss.on("connection", (ws: WebSocket, req: IncomingMessage) => onConnection(ws, resolveClientIp(app, req)));

  server.on("upgrade", (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    let pathname = "";
    try {
      pathname = new URL(req.url ?? "", "http://localhost").pathname;
    } catch {
      // URL hỏng → từ chối bên dưới
    }
    if (pathname !== WS_PATH) {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, req));
  });

  attachBusListeners();

  const pingTimer = setInterval(() => {
    for (const conn of connections) {
      if (!conn.alive) {
        conn.ws.terminate();
        continue;
      }
      conn.alive = false;
      try {
        conn.ws.ping();
      } catch {
        conn.ws.terminate();
      }
    }
  }, PING_INTERVAL_MS);
  pingTimer.unref();

  // Làm mới định kỳ: GUEST hết hạn, thay đổi thành viên mà không phát bus (vd sửa trực tiếp DB);
  // đồng thời đóng 4401 khi tài khoản bị khoá hoặc token_version đổi (đổi mật khẩu/đăng xuất) — nếu không
  // access token đã cấp vẫn giữ socket tới 15 phút.
  const refreshTimer = setInterval(() => {
    void closeRevokedSessions();
    for (const conn of authedConnections()) void refreshHomes(conn);
  }, HOME_REFRESH_INTERVAL_MS);
  refreshTimer.unref();

  server.on("close", () => {
    clearInterval(pingTimer);
    clearInterval(refreshTimer);
    wss.close();
  });
}
