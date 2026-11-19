// JWT phiên (CONTRACT_V2 §2). Payload `{ sub: userId, role, typ }`, ký HS256:
//   typ "dashboard" — cookie nhân viên, 8 giờ,   ký bằng JWT_SECRET
//   typ "portal"    — cookie khách (web), 7 ngày, ký bằng JWT_SECRET
//   typ "access"    — Bearer của Mobile, 15 phút, ký bằng MOBILE_JWT_SECRET (hoặc khoá dẫn xuất)
// `typ` được kiểm khi verify nên token của kênh này không dùng được ở kênh khác (kể cả JWT cũ của
// /api/auth/login — không có `typ` — cũng bị từ chối ở kênh mới). Refresh token KHÔNG phải JWT:
// là chuỗi ngẫu nhiên, chỉ lưu sha256 (xem domain/session.service.ts).
import jwt from "jsonwebtoken";
import { env } from "../../../config/env";
import { HttpError } from "../../../shared/errors/http-error";
import { SYSTEM_ROLES, type SystemRole } from "../../../shared/types/domain";

export type SessionTokenType = "dashboard" | "portal" | "access";

export const SESSION_TTL_SECONDS: Readonly<Record<SessionTokenType, number>> = {
  dashboard: 8 * 60 * 60,
  portal: 7 * 24 * 60 * 60,
  access: 15 * 60,
};
export const REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;

function secretFor(typ: SessionTokenType): string {
  return typ === "access" ? env.mobileJwtSecret : env.jwtSecret;
}

export function signSessionToken(user: { id: number; role: SystemRole; token_version: number }, typ: SessionTokenType): string {
  // `tv` = users.token_version lúc cấp; loadSessionUser từ chối khi lệch (thu hồi phiên stateless)
  return jwt.sign({ role: user.role, typ, tv: Number(user.token_version) }, secretFor(typ), {
    algorithm: "HS256",
    subject: String(user.id),
    expiresIn: SESSION_TTL_SECONDS[typ],
  });
}

export interface VerifiedSessionToken {
  userId: number;
  /** Role lúc cấp token — middleware đối chiếu với role hiện tại trong DB. */
  role: SystemRole;
  /** token_version lúc cấp token. */
  tokenVersion: number;
  expiresAt: Date;
}

function toVerified(payload: string | jwt.JwtPayload, typ: SessionTokenType): VerifiedSessionToken | null {
  if (typeof payload === "string" || payload.typ !== typ) return null;
  const userId = Number(payload.sub);
  const role: unknown = payload.role;
  if (!Number.isSafeInteger(userId) || userId <= 0) return null;
  if (typeof role !== "string" || !(SYSTEM_ROLES as readonly string[]).includes(role)) return null;
  if (typeof payload.exp !== "number") return null;
  // Token cũ không có `tv` bị từ chối → người dùng đăng nhập lại một lần sau khi nâng cấp
  const tv: unknown = payload.tv;
  if (typeof tv !== "number" || !Number.isSafeInteger(tv) || tv < 0) return null;
  return { userId, role: role as SystemRole, tokenVersion: tv, expiresAt: new Date(payload.exp * 1000) };
}

/** Kiểm chữ ký + hạn + `typ`. Hết hạn → 401 TOKEN_EXPIRED; mọi lỗi khác → 401 INVALID_TOKEN. */
export function verifySessionToken(token: string, typ: SessionTokenType): VerifiedSessionToken {
  let payload: string | jwt.JwtPayload;
  try {
    payload = jwt.verify(token, secretFor(typ), { algorithms: ["HS256"] });
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) throw new HttpError(401, "TOKEN_EXPIRED");
    throw new HttpError(401, "INVALID_TOKEN");
  }
  const verified = toVerified(payload, typ);
  if (!verified) throw new HttpError(401, "INVALID_TOKEN");
  return verified;
}

/**
 * Lấy userId từ token ĐÃ HẾT HẠN nhưng chữ ký còn đúng (để ghi audit LOGOUT khi đăng xuất bằng
 * phiên hết hạn). Không dùng để xác thực. Sai chữ ký/typ → null.
 */
export function peekSessionUserId(token: string, typ: SessionTokenType): number | null {
  try {
    const payload = jwt.verify(token, secretFor(typ), { algorithms: ["HS256"], ignoreExpiration: true });
    if (typeof payload === "string" || payload.typ !== typ) return null;
    const userId = Number(payload.sub);
    return Number.isSafeInteger(userId) && userId > 0 ? userId : null;
  } catch {
    return null;
  }
}
