// Middleware xác thực gói telemetry của POST /api/device/data (đường dự phòng HTTP). Gọi CÙNG hàm với đường MQTT
// (domain/ingest-auth.ts — invariant 4): chữ ký v2 2 lớp, node thuộc đúng gateway, chống phát lại bằng sn_ctr.
// Đường HTTP không có danh tính người gửi ở tầng transport (ai cũng POST được qua nginx 443), nên lỗi chữ ký gateway ở
// đây KHÔNG làm khoá thiết bị (chống DoS) — chỉ ghi audit; tần suất bị rate limit theo IP (core/http/rate-limit.ts).
import { NextFunction, Request, Response } from "express";
import { authenticateTelemetry } from "../../domain/ingest-auth";
import { getClientIp, type AuthenticatedHttpTelemetry } from "./ingest-http.dto";

export async function validateDevice(req: Request, res: Response, next: NextFunction): Promise<void> {
  const auth = await authenticateTelemetry(req.body, {
    source: "http",
    ip: getClientIp(req),
    userAgent: req.headers["user-agent"] ?? null,
  });
  if (!auth.ok) {
    const { status, ...body } = auth.rejection;
    res.status(status).json(body);
    return;
  }
  // Gắn gói đã xác thực cho controller (không có secret — VerifiedDevice của module devices)
  (req as Request & { telemetry?: AuthenticatedHttpTelemetry }).telemetry = auth.telemetry;
  next();
}
