// Guard của kênh dịch vụ nội bộ /api/service/** (dịch vụ trong cùng hệ thống, hiện là AI Agent ở agent/).
// Xác thực bằng `Authorization: Bearer <SERVICE_API_TOKEN>` — so sánh thời gian hằng trên SHA-256 của hai chuỗi
// (không lộ độ dài/tiền tố qua thời gian phản hồi). Token chưa cấu hình → 503: kênh tắt, không có token mặc định.
// Không bao giờ log token. Lớp bảo vệ thêm: nginx trả 404 cho /api/service (mọi kiểu hoa/thường) từ bên ngoài,
// rate limit 30 lượt sai / 15 phút / IP (core/http/rate-limit.ts). Agent gọi thẳng backend trong mạng Docker.
import crypto from "crypto";
import type { RequestHandler } from "express";
import { env } from "../../config/env";
import { HttpError } from "../../shared/errors/http-error";

function digest(value: string): Buffer {
  return crypto.createHash("sha256").update(value, "utf8").digest();
}

export const requireServiceToken: RequestHandler = (req, _res, next) => {
  const expected = env.serviceApiToken;
  if (!expected) {
    next(new HttpError(503, "SERVICE_CHANNEL_DISABLED", "SERVICE_API_TOKEN is not configured"));
    return;
  }
  const header = req.headers.authorization ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token || !crypto.timingSafeEqual(digest(token), digest(expected))) {
    next(new HttpError(401, "INVALID_SERVICE_TOKEN", "Missing or invalid service token"));
    return;
  }
  next();
};
