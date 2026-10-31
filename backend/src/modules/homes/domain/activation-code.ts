// Activation Code (FR-2.4, FR-3.2): 12 ký tự Crockford Base32, in dạng XXXX-XXXX-XXXX.
// DB chỉ lưu sha256(code12) (NFR-S2); bản rõ chỉ trả đúng 1 lần lúc tạo/tạo lại.
// QR: "SH1:<code12>:<sig16>" — sig16 = 16 hex đầu của HMAC-SHA256(qrKey, "SH1:" + code12).
// Chữ ký giúp app phân biệt QR thật với QR tự in; QR không chứa secret nào (FR-2.4).
import crypto from "crypto";
import { env } from "../../../config/env";
import { hmacHex, safeEqualHex, sha256Hex } from "../../../shared/crypto";

export const CROCKFORD_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
export const ACTIVATION_CODE_LENGTH = 12;
const QR_VERSION = "SH1";
const QR_RE = /^SH1:([0-9A-Z]{12}):([0-9a-fA-F]{16})$/;

/** Sinh code12 bằng crypto.randomInt (không lệch phân phối như randomBytes % 32). */
export function generateActivationCode(): string {
  let code = "";
  for (let i = 0; i < ACTIVATION_CODE_LENGTH; i++) {
    code += CROCKFORD_ALPHABET[crypto.randomInt(CROCKFORD_ALPHABET.length)];
  }
  return code;
}

/**
 * Chuẩn hoá mã khách gõ tay: HOA, O→0, I/L→1, bỏ mọi ký tự ngoài [0-9A-Z] (gạch, khoảng trắng).
 * Trả code12 hợp lệ hoặc null (sai độ dài / có ký tự ngoài bảng Crockford như U).
 */
export function normalizeActivationCode(input: string): string | null {
  const code = input
    .toUpperCase()
    .replace(/O/g, "0")
    .replace(/[IL]/g, "1")
    .replace(/[^0-9A-Z]/g, "");
  if (code.length !== ACTIVATION_CODE_LENGTH) return null;
  for (const ch of code) {
    if (!CROCKFORD_ALPHABET.includes(ch)) return null;
  }
  return code;
}

/** "Q4ZT6MJK1PSX" → "Q4ZT-6MJK-1PSX". */
export function formatActivationCode(code12: string): string {
  return `${code12.slice(0, 4)}-${code12.slice(4, 8)}-${code12.slice(8, 12)}`;
}

/** Giá trị cột activation_tokens.code_hash / activation_logs.code_hash. */
export function hashActivationCode(code12: string): string {
  return sha256Hex(code12);
}

function qrSignature(code12: string): string {
  return hmacHex(env.activationQrSecret, `${QR_VERSION}:${code12}`).slice(0, 16);
}

export function buildQrPayload(code12: string): string {
  return `${QR_VERSION}:${code12}:${qrSignature(code12)}`;
}

/** Kiểm định dạng + chữ ký QR; hợp lệ → code12, ngược lại null (claim coi như NOT_FOUND, reason INVALID_QR). */
export function parseQrPayload(payload: string): string | null {
  const match = QR_RE.exec(payload.trim());
  if (!match) return null;
  const [, code12, sig16] = match;
  if (normalizeActivationCode(code12) !== code12) return null;
  return safeEqualHex(qrSignature(code12), sig16.toLowerCase()) ? code12 : null;
}
