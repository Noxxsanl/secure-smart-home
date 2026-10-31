// Kiểu + hằng số của WebSocket hub cho Mobile (CONTRACT_V2 §4.3) và quy tắc thuần "connection này thấy thiết bị nào".
import type { WebSocket } from "ws";

export const WS_PATH = "/api/mobile/ws";
export const AUTH_TIMEOUT_MS = 10_000;
export const PING_INTERVAL_MS = 30_000;
export const HOME_REFRESH_INTERVAL_MS = 60_000;
export const CLOSE_UNAUTHORIZED = 4401;
export const MAX_FRAME_BYTES = 4096; // khung auth chỉ chứa 1 JWT; chặn gửi rác lớn
export const MAX_BUFFERED_BYTES = 1_000_000; // client chậm: bỏ qua sự kiện thay vì phình RAM
export const CLOSE_POLICY_VIOLATION = 1008; // vượt giới hạn số kết nối
export const MAX_UNAUTH_PER_IP = 20; // kết nối CHƯA xác thực / IP — chặn mở socket hàng loạt khi chưa có token
export const MAX_AUTH_PER_USER = 5; // kết nối đã xác thực / user
export const MAX_TIMER_MS = 2_147_483_647; // giới hạn setTimeout (≈ 24,8 ngày)

export interface HomeScope {
  /** null = thấy mọi thiết bị; mảng = GUEST chỉ thấy các thiết bị này. */
  guestDeviceIds: Set<number> | null;
}

export interface Connection {
  ws: WebSocket;
  userId: number | null;
  /** IP client (đã qua `trust proxy`) lúc nâng cấp kết nối — dùng đếm kết nối chưa xác thực. */
  ip: string;
  /** token_version của access token đã xác thực; lệch DB → phiên bị thu hồi (đóng 4401). */
  tokenVersion: number;
  homes: Map<number, HomeScope>;
  alive: boolean;
  authTimer: NodeJS.Timeout | null;
  expiryTimer: NodeJS.Timeout | null;
  refreshing: Promise<void> | null;
}

export function canSeeDevice(scope: HomeScope, deviceId: number): boolean {
  return scope.guestDeviceIds === null || scope.guestDeviceIds.has(deviceId);
}
