// IP/User-Agent của request cho audit_log, activation_logs, refresh_tokens.
// Giữ đúng cách lấy IP của code cũ (X-Forwarded-For đầu tiên, rồi socket) để log
// V2 và log cũ nhất quán. Chỉ dùng để GHI LOG — rate limit dùng req.ip của express-rate-limit.
// Dùng req.ip (theo cấu hình `trust proxy`, env TRUST_PROXY) thay vì tin X-Forwarded-For thô: khi không
// đứng sau proxy tin cậy, client không giả được IP trong audit_log bằng header.
import type { Request } from "express";

export function getClientIp(req: Request): string | null {
  const ip = req.ip || req.socket.remoteAddress || "";
  return ip ? ip.slice(0, 45) : null; // cột ip_address VARCHAR(45)
}

export function getUserAgent(req: Request): string | null {
  const ua = req.headers["user-agent"];
  return typeof ua === "string" && ua ? ua.slice(0, 255) : null;
}

export interface RequestMeta {
  ip: string | null;
  userAgent: string | null;
}

export function requestMeta(req: Request): RequestMeta {
  return { ip: getClientIp(req), userAgent: getUserAgent(req) };
}
