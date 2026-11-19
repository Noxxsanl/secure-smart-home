// Bộ định tuyến sự kiện `upgrade` của HTTP server — MỘT listener duy nhất cho mọi WebSocket của backend.
//
// Vì sao: Node phát `upgrade` cho TẤT CẢ listener; nếu mỗi module tự `server.on("upgrade")` rồi `socket.destroy()` path
// không phải của mình thì module đăng ký đầu tiên giết mất WebSocket của module sau. Ở đây module chỉ ĐĂNG KÝ theo
// pathname (chuỗi khớp tuyệt đối hoặc RegExp), path lạ thì đóng socket đúng 1 chỗ.
//
// Dùng: main.ts gọi createUpgradeRouter(server) rồi chuyển router cho từng module (attachWsHub, attachCameraLive…).
// Handler chịu trách nhiệm xác thực TRƯỚC khi handleUpgrade; từ chối bằng rejectUpgrade() (HTTP thô rồi đóng socket).
// Không log URL/header (có thể chứa token) — invariant 2.
import type { Application } from "express";
import type { IncomingMessage, Server } from "http";
import type { Duplex } from "stream";

export interface UpgradeContext {
  req: IncomingMessage;
  socket: Duplex;
  head: Buffer;
  /** Pathname đã bỏ query string. */
  pathname: string;
  /** Nhóm bắt của RegExp (rỗng khi đăng ký bằng chuỗi). */
  params: string[];
}

export type UpgradeHandler = (ctx: UpgradeContext) => void | Promise<void>;

export interface UpgradeRouter {
  /** Đăng ký route: chuỗi = khớp tuyệt đối pathname; RegExp = khớp pathname, nhóm bắt vào `params`. */
  on(path: string | RegExp, handler: UpgradeHandler): void;
}

interface Route {
  path: string | RegExp;
  handler: UpgradeHandler;
}

const STATUS_TEXT: Readonly<Record<number, string>> = {
  400: "Bad Request",
  401: "Unauthorized",
  403: "Forbidden",
  404: "Not Found",
  409: "Conflict",
  429: "Too Many Requests",
  500: "Internal Server Error",
  503: "Service Unavailable",
};

/**
 * Từ chối yêu cầu nâng cấp bằng phản hồi HTTP thô `{ error, ... }` rồi đóng socket. Dùng được trước khi handleUpgrade
 * (sau khi nâng cấp thành WebSocket thì đóng bằng mã close của WebSocket).
 */
export function rejectUpgrade(socket: Duplex, status: number, error: string, extra?: Record<string, unknown>): void {
  if (socket.destroyed) return;
  const body = JSON.stringify({ error, ...extra });
  const response =
    `HTTP/1.1 ${status} ${STATUS_TEXT[status] ?? "Error"}\r\n` +
    "Connection: close\r\n" +
    "Content-Type: application/json; charset=utf-8\r\n" +
    `Content-Length: ${Buffer.byteLength(body)}\r\n\r\n` +
    body;
  try {
    socket.end(response, () => socket.destroy());
  } catch {
    socket.destroy();
    return;
  }
  // Phòng client không đọc/đóng: không giữ socket quá 2 s
  setTimeout(() => socket.destroy(), 2000).unref();
}

/**
 * IP client theo đúng cấu hình `trust proxy` của Express: dựng object kế thừa `app.request` (getter `ip`
 * dùng `trust proxy fn` của app) từ request nâng cấp, nên không tin X-Forwarded-For khi TRUST_PROXY=false.
 */
export function resolveUpgradeClientIp(app: Application, req: IncomingMessage): string {
  try {
    const fake = Object.create((app as unknown as { request: object }).request, {
      headers: { value: req.headers },
      socket: { value: req.socket },
    }) as { ip?: string };
    return fake.ip || req.socket.remoteAddress || "unknown";
  } catch {
    return req.socket.remoteAddress || "unknown";
  }
}

function pathnameOf(req: IncomingMessage): string | null {
  try {
    return new URL(req.url ?? "", "http://localhost").pathname;
  } catch {
    return null;
  }
}

/** Gắn listener `upgrade` duy nhất vào server. Path không có route → destroy socket (hành vi cũ của mobile hub). */
export function createUpgradeRouter(server: Server): UpgradeRouter {
  const routes: Route[] = [];

  server.on("upgrade", (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    // Lỗi socket trước khi ws nhận quyền sở hữu (client reset giữa chừng) không được làm sập process
    socket.on("error", () => undefined);

    const pathname = pathnameOf(req);
    if (pathname === null) {
      socket.destroy();
      return;
    }
    for (const route of routes) {
      let params: string[] | null = null;
      if (typeof route.path === "string") {
        if (route.path === pathname) params = [];
      } else {
        const match = route.path.exec(pathname);
        if (match) params = match.slice(1);
      }
      if (params === null) continue;
      Promise.resolve()
        .then(() => route.handler({ req, socket, head, pathname, params: params ?? [] }))
        .catch((err: unknown) => {
          console.error("[ws-upgrade] handler failed:", err instanceof Error ? err.message : "unknown error");
          rejectUpgrade(socket, 500, "INTERNAL_ERROR");
        });
      return;
    }
    socket.destroy();
  });

  return {
    on(path, handler) {
      if (typeof path === "string" && routes.some((route) => route.path === path)) {
        throw new Error(`Upgrade route already registered: ${path}`);
      }
      routes.push({ path, handler });
    },
  };
}
