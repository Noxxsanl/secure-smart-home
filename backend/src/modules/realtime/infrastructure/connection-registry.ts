// Sổ các connection WebSocket đang mở (RAM của tiến trình) + thao tác gửi/đóng. Token và nội dung khung
// không bao giờ được log (invariant 2).
import { WebSocket } from "ws";
import {
  CLOSE_POLICY_VIOLATION,
  CLOSE_UNAUTHORIZED,
  MAX_BUFFERED_BYTES,
  type Connection,
} from "../domain/ws-connection";

export const connections = new Set<Connection>();

export function send(conn: Connection, payload: Record<string, unknown>): void {
  const { ws } = conn;
  if (ws.readyState !== WebSocket.OPEN || ws.bufferedAmount > MAX_BUFFERED_BYTES) return;
  try {
    ws.send(JSON.stringify(payload));
  } catch {
    // connection đang đóng — bỏ qua
  }
}

export function closeTooMany(conn: Connection, reason: string): void {
  try {
    conn.ws.close(CLOSE_POLICY_VIOLATION, reason);
  } catch {
    conn.ws.terminate();
  }
}

export function closeUnauthorized(conn: Connection, reason: string): void {
  try {
    conn.ws.close(CLOSE_UNAUTHORIZED, reason);
  } catch {
    conn.ws.terminate();
  }
}

export function clearTimers(conn: Connection): void {
  if (conn.authTimer) clearTimeout(conn.authTimer);
  if (conn.expiryTimer) clearTimeout(conn.expiryTimer);
  conn.authTimer = null;
  conn.expiryTimer = null;
}

export function authedConnections(): Connection[] {
  return [...connections].filter((conn) => conn.userId !== null);
}
