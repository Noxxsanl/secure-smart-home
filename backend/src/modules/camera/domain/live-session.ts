// Sổ phiên xem trực tiếp camera (FR-5.8 live view) — CHỈ trong RAM: không ghi khung hình xuống đĩa, không ghi DB.
// Mỗi camera tối đa 1 phiên; phiên có: tập viewer (web), uplink gateway (≤ 1), khung JPEG cuối + thời điểm, trạng thái.
// Vòng đời + timer ở features/live-relay/live-relay.handler.ts; file này chỉ có kiểu, hằng số và sổ (Map) + truy vấn thuần.
import type { WebSocket } from "ws";
import type { AuthContext } from "../../../core/auth/auth-context";

/** Trạng thái gửi cho viewer: {"type":"state","state":…}. */
export type LiveState = "connecting" | "live" | "reconnecting" | "camera_unavailable";

/** Mã đóng WebSocket của ứng dụng (trình duyệt không đọc được HTTP status khi upgrade lỗi nên dùng mã close). */
export const LIVE_CLOSE = {
  NORMAL: 1000,
  UNAUTHORIZED: 4401, // phiên đăng nhập hết hạn / token_version đổi / tài khoản bị khoá
  FORBIDDEN: 4403, // GUEST, hoặc mất quyền giữa chừng
  NOT_FOUND: 4404, // không tồn tại / không thuộc nhà của user / không phải camera (không lộ — invariant 6)
  CAMERA_TIMEOUT: 4408, // camera không phản hồi
  FULL: 4409, // camera đủ số người xem
  RATE_LIMITED: 4429, // quá số luồng / số lần mở
  UNSUPPORTED: 4501, // camera mô phỏng
} as const;

export const LIVE_LIMITS = {
  maxViewersPerCamera: 4,
  maxStreamsPerUser: 2,
  maxOpensPerMinutePerUser: 10,
  /** Giới hạn upgrade / phút / IP, kiểm TRƯỚC mọi xử lý (upgrade không đi qua rate limit của Express). Uplink: gateway nối lại 1/2/4 s. */
  maxUplinkUpgradesPerMinutePerIp: 30,
  maxViewerUpgradesPerMinutePerIp: 60,
  /** Uplink cũ phải im lặng ≥ ngần này thì uplink mới của cùng phiên mới được thay (chống replay chiếm uplink thật). */
  uplinkReplaceSilenceMs: 3000,
  /** Chưa có uplink sau ngần này → gửi lại live_start 1 lần. */
  startRetryMs: 10_000,
  /** Chưa có uplink / không có khung sau ngần này → camera_unavailable (đóng viewer 4408). */
  unavailableMs: 20_000,
  /** Viewer cuối rời → chờ ngần này rồi live_stop + đóng uplink + xoá phiên. */
  idleStopMs: 10_000,
  /** Uplink rớt → chờ nối lại ngần này. */
  reconnectGraceMs: 15_000,
  /** Uplink không có tin nhắn nào ngần này → coi là chết. */
  uplinkSilenceMs: 15_000,
  /** Kiểm lại token_version / khoá tài khoản / quyền nhà của viewer. */
  recheckMs: 30_000,
  pingMs: 30_000,
  /** Viewer chậm: bufferedAmount vượt ngưỡng → bỏ khung. */
  maxBufferedBytes: 256 * 1024,
  maxFrameBytes: 200 * 1024,
  /** maxPayload của WebSocket uplink (lớn hơn maxFrameBytes để khung quá cỡ bị BỎ chứ không rớt kết nối). */
  uplinkMaxPayloadBytes: 256 * 1024,
  /** Viewer không cần gửi gì → payload tối đa nhỏ. */
  viewerMaxPayloadBytes: 1024,
  maxFramesPerSecond: 25,
  /** Viewer mới nhận ngay khung cuối nếu còn tươi hơn ngần này. */
  lastFrameMaxAgeMs: 2000,
} as const;

export interface LiveViewer {
  session: LiveSession;
  ws: WebSocket;
  userId: number;
  auth: AuthContext;
  tokenVersion: number;
  /** Hạn của cookie (JWT exp) — quá hạn → 4401 ở lần kiểm lại kế tiếp. */
  expiresAt: Date;
  ip: string | null;
  userAgent: string | null;
  joinedAt: number;
  lastPingAt: number;
  lastCheckAt: number;
  alive: boolean;
  checking: boolean;
  /** Đã ghi audit END / đã rời phiên. */
  ended: boolean;
}

export interface LiveUplink {
  ws: WebSocket;
  attachedAt: number;
  /** Tin nhắn cuối (khung hoặc status) — quá uplinkSilenceMs thì đóng. */
  lastMessageAt: number;
  /** Gateway đã gửi {"type":"end"} — đóng sau đó là chủ ý, không chờ nối lại. */
  ended: boolean;
  /** Cửa sổ 1 s đếm khung để chặn > 25 khung/s. */
  windowStart: number;
  windowCount: number;
}

export interface LiveSession {
  /** UUID v4; đồng thời là command_id của lệnh MQTT. KHÔNG log (invariant 2). */
  sessionId: string;
  cameraId: number;
  cameraUid: string;
  /** Tên camera — chỉ để viết message audit tiếng Việt. */
  cameraName: string;
  gatewayDbId: number;
  gatewayUid: string;
  homeId: number;
  viewers: Set<LiveViewer>;
  uplink: LiveUplink | null;
  lastFrame: Buffer | null;
  lastFrameAt: number;
  state: LiveState;
  startedAt: number;
  /** Đã gửi lại live_start (tối đa 1 lần). */
  startRetried: boolean;
  /** Thời điểm uplink rớt (null = chưa rớt / đang nối). */
  reconnectingSince: number | null;
  /** Thời điểm viewer cuối rời (null = còn viewer). */
  idleSince: number | null;
  destroyed: boolean;
}

// ── Sổ phiên ────────────────────────────────────────────────────────────────

const sessionsByCamera = new Map<number, LiveSession>();

export function getSessionByCamera(cameraId: number): LiveSession | undefined {
  return sessionsByCamera.get(cameraId);
}

/** Phiên theo session_id (uplink gateway đưa session_id trong header). So khớp thời gian không đổi không cần: id là UUID 122 bit. */
export function findSessionById(sessionId: string): LiveSession | undefined {
  for (const session of sessionsByCamera.values()) if (session.sessionId === sessionId) return session;
  return undefined;
}

export function putSession(session: LiveSession): void {
  sessionsByCamera.set(session.cameraId, session);
}

export function removeSession(session: LiveSession): void {
  if (sessionsByCamera.get(session.cameraId) === session) sessionsByCamera.delete(session.cameraId);
}

export function listSessions(): LiveSession[] {
  return [...sessionsByCamera.values()];
}

/** Số luồng đang xem của một user trên mọi camera. */
export function countUserStreams(userId: number): number {
  let count = 0;
  for (const session of sessionsByCamera.values()) {
    for (const viewer of session.viewers) if (viewer.userId === userId && !viewer.ended) count++;
  }
  return count;
}

// ── Giới hạn số lần mở / phút / user ─────────────────────────────────────────

const opensByUser = new Map<number, number[]>();

/** Ghi nhận 1 lần mở; false nếu đã đủ maxOpensPerMinutePerUser trong 60 s gần nhất (lần này không được tính). */
export function registerOpenAttempt(userId: number, now: number): boolean {
  const recent = (opensByUser.get(userId) ?? []).filter((at) => now - at < 60_000);
  if (recent.length >= LIVE_LIMITS.maxOpensPerMinutePerUser) {
    opensByUser.set(userId, recent);
    return false;
  }
  recent.push(now);
  opensByUser.set(userId, recent);
  return true;
}

/** Dọn bản ghi đếm đã nguội (gọi định kỳ để Map không phình theo số user / IP). */
export function pruneOpenAttempts(now: number): void {
  for (const [userId, times] of opensByUser) {
    const recent = times.filter((at) => now - at < 60_000);
    if (recent.length === 0) opensByUser.delete(userId);
    else opensByUser.set(userId, recent);
  }
  for (const [key, times] of upgradesByIp) {
    const recent = times.filter((at) => now - at < 60_000);
    if (recent.length === 0) upgradesByIp.delete(key);
    else upgradesByIp.set(key, recent);
  }
}

// ── Giới hạn upgrade / phút / IP (trước xác thực) ────────────────────────────

const upgradesByIp = new Map<string, number[]>();
let lastIpPruneAt = 0;

/**
 * Ghi nhận 1 yêu cầu upgrade từ `ip` cho kênh `kind`; false nếu đã đủ `limit` trong 60 s gần nhất (lần này không được tính).
 * Tự dọn các IP đã nguội mỗi 60 s ngay trong hàm này (không phụ thuộc ticker, vốn chỉ chạy khi có phiên).
 */
export function registerUpgradeAttempt(kind: "uplink" | "viewer", ip: string, limit: number, now: number): boolean {
  if (now - lastIpPruneAt >= 60_000) {
    lastIpPruneAt = now;
    pruneOpenAttempts(now);
  }
  const key = `${kind}:${ip}`;
  const recent = (upgradesByIp.get(key) ?? []).filter((at) => now - at < 60_000);
  if (recent.length >= limit) {
    upgradesByIp.set(key, recent);
    return false;
  }
  recent.push(now);
  upgradesByIp.set(key, recent);
  return true;
}
