// Chuẩn hoá lỗi trả về (thay cho ExceptionFilter của NestJS). Gắn CUỐI CÙNG trong app.ts.
//   HttpError → { error, detail?, …extra } đúng quy ước skill backend §7;
//   lỗi body-parser (JSON hỏng, body quá lớn) → 400/413;
//   còn lại là lỗi không lường trước → 500 + gọi onUnhandled (app.ts ghi audit_log UNHANDLED_ERROR).
// Phản hồi 500 không lộ chi tiết nội bộ (message của driver pg có thể chứa SQL/giá trị).
import type { ErrorRequestHandler, Request, RequestHandler } from "express";
import { env } from "../../config/env";
import { HttpError, fromBodyParserError, isBodyParserError } from "../../shared/errors/http-error";

export interface UnhandledErrorInfo {
  name: string;
  code: string | null;
}

export const notFoundHandler: RequestHandler = (_req, res) => {
  res.status(404).json({ error: "NOT_FOUND", detail: "Route not found" });
};

export function createErrorFilter(onUnhandled: (req: Request, info: UnhandledErrorInfo) => void): ErrorRequestHandler {
  return (err, req, res, next) => {
    if (res.headersSent) {
      next(err);
      return;
    }
    if (err instanceof HttpError) {
      res.status(err.status).json(err.toBody());
      return;
    }
    if (isBodyParserError(err)) {
      const converted = fromBodyParserError(err);
      res.status(converted.status).json(converted.toBody());
      return;
    }

    const name = err instanceof Error ? err.name : "UnknownError";
    const code = typeof err === "object" && err !== null && "code" in err ? String((err as { code: unknown }).code) : null;
    // Dev: in stack để debug. Production: chỉ tên + mã lỗi (không in message/stack có thể chứa dữ liệu nhạy cảm)
    if (!env.isProduction && err instanceof Error) {
      console.error(`[error] ${req.method} ${req.path}:`, err.stack ?? err.message);
    } else {
      console.error(`[error] ${req.method} ${req.path}: ${name}${code ? ` (${code})` : ""}`);
    }
    onUnhandled(req, { name, code });
    res.status(500).json({ error: "INTERNAL_ERROR" });
  };
}
