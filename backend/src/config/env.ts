import crypto from "crypto";
import dotenv from "dotenv";

dotenv.config();

const REQUIRED_ENV_VARS = [
  "DB_HOST",
  "DB_USER",
  "DB_PASS",
  "DB_NAME",
  "JWT_SECRET",
  "PORT",
] as const;

export function validateEnv(): void {
  const missing = REQUIRED_ENV_VARS.filter((key) => !process.env[key]?.trim());
  if (missing.length) {
    console.error(`[startup] Missing required environment variables: ${missing.join(", ")}`);
    process.exit(1);
  }

  if (process.env.JWT_SECRET!.trim().length < 32) {
    console.error("[startup] JWT_SECRET must be at least 32 characters");
    process.exit(1);
  }
}

// Validate immediately on module load so any import of this file triggers the check
validateEnv();

// ---------------------------------------------------------------------------
// Biến tuỳ chọn của V2 (CONTRACT_V2 §2, §6). Tất cả có mặc định an toàn để
// backend vẫn chạy khi .env cũ chưa khai báo; giá trị bí mật không bao giờ in ra log.
// ---------------------------------------------------------------------------

const nodeEnv = process.env.NODE_ENV?.trim() || "development";
const isProduction = nodeEnv === "production";
// Giữ nguyên chuỗi gốc (không trim) để khớp cách routes/auth.ts cũ ký JWT
const jwtSecret = process.env.JWT_SECRET!;

function readBool(name: string, fallback: boolean): boolean {
  const raw = process.env[name]?.trim().toLowerCase();
  if (!raw) return fallback;
  if (["1", "true", "yes", "on"].includes(raw)) return true;
  if (["0", "false", "no", "off"].includes(raw)) return false;
  console.warn(`[startup] ${name} is not a boolean – using default ${fallback}`);
  return fallback;
}

function readInt(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    console.warn(`[startup] ${name} must be an integer in [${min}, ${max}] – using default ${fallback}`);
    return fallback;
  }
  return value;
}

// Secret riêng nếu được cấu hình (≥ 32 ký tự), ngược lại dẫn xuất từ JWT_SECRET bằng
// HMAC với nhãn cố định: mỗi mục đích có khoá khác nhau nên lộ một loại token không
// giả mạo được loại kia, mà không bắt người chạy demo khai báo thêm biến.
function readSecret(name: string, derivationLabel: string): string {
  const raw = process.env[name]?.trim();
  if (raw) {
    if (raw.length >= 32) return raw;
    console.warn(`[startup] ${name} is shorter than 32 characters – ignored, using a key derived from JWT_SECRET`);
  }
  return crypto.createHmac("sha256", jwtSecret).update(derivationLabel).digest("hex");
}

// TRUST_PROXY → giá trị cho app.set("trust proxy", …). Mặc định false (không tin X-Forwarded-For).
// Nhận: số hop ("1"), hoặc danh sách subnet/IP/từ khoá loopback|linklocal|uniquelocal phân tách bằng dấu phẩy.
// KHÔNG nhận "true" (tin mọi proxy → client giả IP để né rate limit) — coi như chưa cấu hình.
function readTrustProxy(): boolean | number | string {
  const raw = process.env.TRUST_PROXY?.trim();
  if (!raw || raw.toLowerCase() === "false" || raw === "0") return false;
  if (/^\d+$/.test(raw)) {
    const hops = Number(raw);
    if (hops >= 1 && hops <= 10) return hops;
    console.warn("[startup] TRUST_PROXY hop count must be in [1, 10] – proxy headers are NOT trusted");
    return false;
  }
  if (raw.toLowerCase() === "true") {
    console.warn("[startup] TRUST_PROXY=true is unsafe and ignored – use a hop count or a subnet list");
    return false;
  }
  const entries = raw.split(",").map((part) => part.trim()).filter(Boolean);
  if (entries.length === 0 || !entries.every((part) => /^[0-9a-fA-F:./]+$|^(loopback|linklocal|uniquelocal)$/.test(part))) {
    console.warn("[startup] TRUST_PROXY is not a valid hop count / subnet list – proxy headers are NOT trusted");
    return false;
  }
  return entries.join(",");
}

export interface AppEnv {
  /** Giá trị `trust proxy` của Express (false | số hop | danh sách subnet). */
  trustProxy: boolean | number | string;
  nodeEnv: string;
  isProduction: boolean;
  /** Ký cookie phiên Dashboard/Portal (giống JWT cũ). */
  jwtSecret: string;
  /** Ký access token Mobile (Bearer, 15 phút). */
  mobileJwtSecret: string;
  /** Khoá ký chữ ký QR kích hoạt `SH1:<code>:<sig16>`. */
  activationQrSecret: string;
  /** Cookie có cờ `Secure` (mặc định bật khi NODE_ENV=production). */
  cookieSecure: boolean;
  /** Bật simulator thiết bị ảo (mặc định bật khi không phải production). */
  deviceSimulator: boolean;
  /** Chạy seed dữ liệu demo một lần sau migration (mặc định bật khi không phải production). */
  seedDemoData: boolean;
  /** Hạn mặc định của Activation Code (docs/01: 180 ngày). */
  activationCodeTtlDays: number;
  /** Thư mục lưu file firmware upload (tương đối theo thư mục chạy backend). */
  firmwareStorageDir: string;
  /** Số ngày giữ sensor_data (job retention hằng giờ). */
  telemetryRetentionDays: number;
}

export const env: Readonly<AppEnv> = Object.freeze({
  trustProxy: readTrustProxy(),
  nodeEnv,
  isProduction,
  jwtSecret,
  mobileJwtSecret: readSecret("MOBILE_JWT_SECRET", "mobile-access-v1"),
  activationQrSecret: readSecret("ACTIVATION_QR_SECRET", "activation-qr-v1"),
  cookieSecure: readBool("COOKIE_SECURE", isProduction),
  deviceSimulator: readBool("DEVICE_SIMULATOR", !isProduction),
  seedDemoData: readBool("SEED_DEMO_DATA", !isProduction),
  activationCodeTtlDays: readInt("ACTIVATION_CODE_TTL_DAYS", 180, 1, 3650),
  firmwareStorageDir: process.env.FIRMWARE_STORAGE_DIR?.trim() || "storage/firmware",
  telemetryRetentionDays: readInt("TELEMETRY_RETENTION_DAYS", 8, 1, 3650),
});
