// Log request (morgan "dev") KHÔNG kèm query string: /api/device/sensors nhận gw_hmac qua query và token/mã
// có thể nằm trong URL của client lạ — invariant 2 (không log token/secret). Format "dev" dùng token :url.
import type { Request, RequestHandler } from "express";
import morgan from "morgan";

morgan.token("url", (req) => ((req as Request).originalUrl ?? req.url ?? "").split("?")[0]);

export const requestLogger: RequestHandler = morgan("dev");
