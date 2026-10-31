// Express app: middleware bảo mật → rate limit → router /api (app.module.ts) → 404 → error filter.
// main.ts gọi app.listen; WebSocket gắn vào cùng HTTP server ở đó.
import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import helmet from "helmet";
import { buildApiRouter } from "./app.module";
import { env } from "./config/env";
import { createErrorFilter, notFoundHandler } from "./core/filters/error.filter";
import { applyRateLimits } from "./core/http/rate-limit";
import { getClientIp, getUserAgent } from "./core/http/request-meta";
import { requestLogger } from "./core/http/request-logger";
import { logEvent } from "./modules/audit";

dotenv.config();

const app = express();

// Sau reverse proxy (nginx) req.ip phải lấy từ X-Forwarded-For, nếu không mọi client dùng chung IP của proxy
// và rate limit theo IP chặn nhầm tất cả. Chỉ tin đúng số hop/subnet cấu hình (TRUST_PROXY) — không bao giờ `true`.
app.set("trust proxy", env.trustProxy);

// HTTP security headers (XSS, clickjacking, MIME sniffing, etc.)
app.use(helmet());

// CORS – only allow the Next.js frontend origin
app.use(
  cors({
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
    credentials: true,
  })
);

// Limit JSON body size to prevent payload-based DoS
app.use(express.json({ limit: "10kb" }));

app.use(requestLogger);

applyRateLimits(app);

app.use("/api", buildApiRouter());

app.use(notFoundHandler);

// Lỗi không lường trước → audit_log category `error` (module audit); filter không phụ thuộc module nào.
app.use(
  createErrorFilter((req, { name, code }) => {
    void logEvent({
      eventType: "UNHANDLED_ERROR",
      message: `Lỗi không xử lý được tại ${req.method} ${req.path}`,
      ip: getClientIp(req),
      userAgent: getUserAgent(req),
      details: { name, code, method: req.method, path: req.path },
    });
  })
);

export default app;
