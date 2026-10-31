// Rate limit theo IP và theo định danh đăng nhập (CONTRACT_V2 §2.5). Gắn TRƯỚC router /api trong app.ts.
// Đường dẫn ở đây phải khớp route thật — đổi route ở module thì sửa cả bảng dưới.
import type { Express, Request } from "express";
import rateLimit from "express-rate-limit";
import { sha256Hex } from "../../shared/crypto";

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

export function applyRateLimits(app: Express): void {
  // Legacy: /api/auth/login – 10 request / 15 phút (giữ nguyên cho tests/security/attack_demo*.sh)
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
  // Claim: 20/giờ theo IP (giới hạn theo mã/tài khoản của FR-3.6 nằm ở feature claim-home)
  const claimLimiter = makeLimiter(HOUR, 20, "Too many activation attempts, try again later");
  app.post("/api/mobile/claim", claimLimiter);
  app.post("/api/portal/claim", claimLimiter);
  // Lệnh điều khiển thiết bị: 60/phút
  const commandLimiter = makeLimiter(MINUTE, 60, "Too many device commands, try again later");
  app.post("/api/mobile/devices/:deviceId/commands", commandLimiter);
  app.post("/api/portal/devices/:deviceId/commands", commandLimiter);

  app.use("/api", apiLimiter);
}
