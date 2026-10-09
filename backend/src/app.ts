import cors from "cors";
import dotenv from "dotenv";
import express, { NextFunction, Request, Response } from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import morgan from "morgan";
import { env } from "./config/env";
import { getClientIp, getUserAgent } from "./lib/clientIp";
import { sha256Hex } from "./lib/crypto";
import { HttpError, fromBodyParserError, isBodyParserError } from "./lib/http";
import { logEvent } from "./modules/logs/logEvent";
import routes from "./routes";

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

// Log request không kèm query string: /api/device/sensors nhận gw_hmac qua query và token/mã có thể
// nằm trong URL của client lạ — invariant 2 (không log token/secret). "dev" format dùng token :url.
morgan.token("url", (req) => ((req as Request).originalUrl ?? req.url ?? "").split("?")[0]);
app.use(morgan("dev"));

// ── Rate limit (CONTRACT_V2 §2.5, theo IP) ─────────────────────────────────

function makeLimiter(
  windowMs: number,
  max: number,
  detail: string,
  skip?: (req: Request) => boolean,
  keyGenerator?: (req: Request) => string
) {
  return rateLimit({
    windowMs,
    max,
    skip,
    ...(keyGenerator ? { keyGenerator } : {}),
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "TOO_MANY_REQUESTS", detail },
  });
}

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const LOGIN_WINDOW = 15 * MINUTE;

// Legacy: /api/auth/login – 10 request / 15 phút (giữ nguyên cho scripts/attack_demo*.sh)
const authLimiter = makeLimiter(LOGIN_WINDOW, 10, "Too many login attempts, try again later");
// Legacy: /api/device/data – 60 request / phút (firmware); các route khác có hạn mức riêng bên dưới
const deviceDataLimiter = makeLimiter(MINUTE, 60, "Device data rate limit exceeded");
// Chung cho /api/**: 1500 request / 5 phút (SWR poll 5–15 s trên nhiều trang — 100/15 phút cũ sẽ chặn UI)
const apiLimiter = makeLimiter(5 * MINUTE, 1500, "API rate limit exceeded", (req) =>
  req.originalUrl.startsWith("/api/device/data")
);

app.use("/api/auth/login", authLimiter);
app.use("/api/device/data", deviceDataLimiter);

// Đăng nhập 3 kênh: mỗi kênh một bộ đếm riêng (10 / 15 phút) để demo đăng nhập 3 portal không
// ăn quota của nhau; đăng ký 10/giờ dùng chung 2 kênh; refresh 60/15 phút.
// Thêm bộ đếm theo ĐỊNH DANH đăng nhập (sha256 của username/email chữ thường): chặn dò mật khẩu một tài khoản
// từ nhiều IP, và không phụ thuộc IP đúng hay sai. Hash để không giữ email/username bản rõ trong RAM/log.
// Không có định danh hợp lệ (body thiếu) → bỏ qua; handler sẽ trả 400 MISSING_FIELDS.
function loginIdentifierKey(field: "username" | "email") {
  return (req: Request): string => {
    const body: unknown = req.body;
    const value = typeof body === "object" && body !== null ? (body as Record<string, unknown>)[field] : undefined;
    return typeof value === "string" ? `login-id:${sha256Hex(value.trim().toLowerCase().slice(0, 190))}` : "login-id:none";
  };
}
function hasLoginIdentifier(field: "username" | "email") {
  return (req: Request): boolean => {
    const body: unknown = req.body;
    const value = typeof body === "object" && body !== null ? (body as Record<string, unknown>)[field] : undefined;
    return !(typeof value === "string" && value.trim().length > 0);
  };
}
const LOGIN_DETAIL = "Too many login attempts, try again later";
for (const [path, field] of [
  ["/api/dashboard/auth/login", "username"],
  ["/api/portal/auth/login", "email"],
  ["/api/mobile/auth/login", "email"],
] as const) {
  app.post(path, makeLimiter(LOGIN_WINDOW, 10, LOGIN_DETAIL));
  app.post(path, makeLimiter(LOGIN_WINDOW, 10, LOGIN_DETAIL, hasLoginIdentifier(field), loginIdentifierKey(field)));
}
const registerLimiter = makeLimiter(HOUR, 10, "Too many registrations, try again later");
app.post("/api/portal/auth/register", registerLimiter);
app.post("/api/mobile/auth/register", registerLimiter);
app.post("/api/mobile/auth/refresh", makeLimiter(LOGIN_WINDOW, 60, "Too many token refreshes, try again later"));
// Claim: 20/giờ theo IP (giới hạn theo mã/tài khoản của FR-3.6 nằm ở service claim)
const claimLimiter = makeLimiter(HOUR, 20, "Too many activation attempts, try again later");
app.post("/api/mobile/claim", claimLimiter);
app.post("/api/portal/claim", claimLimiter);
// Lệnh điều khiển thiết bị: 60/phút
const commandLimiter = makeLimiter(MINUTE, 60, "Too many device commands, try again later");
app.post("/api/mobile/devices/:deviceId/commands", commandLimiter);
app.post("/api/portal/devices/:deviceId/commands", commandLimiter);

app.use("/api", apiLimiter);

app.use("/api", routes);

app.use((req: Request, res: Response) => {
  res.status(404).json({ error: "NOT_FOUND", detail: "Route not found" });
});

// Error middleware: HttpError → { error, detail?, …extra } đúng quy ước skill backend §7;
// lỗi body-parser (JSON hỏng, body quá lớn) → 400/413; còn lại là lỗi không lường trước → 500 và ghi
// audit_log category `error`. Phản hồi 500 không lộ chi tiết nội bộ (message của mysql2 có thể chứa SQL/giá trị).
app.use((err: unknown, req: Request, res: Response, next: NextFunction) => {
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
  void logEvent({
    eventType: "UNHANDLED_ERROR",
    message: `Lỗi không xử lý được tại ${req.method} ${req.path}`,
    ip: getClientIp(req),
    userAgent: getUserAgent(req),
    details: { name, code, method: req.method, path: req.path },
  });
  res.status(500).json({ error: "INTERNAL_ERROR" });
});

export default app;
