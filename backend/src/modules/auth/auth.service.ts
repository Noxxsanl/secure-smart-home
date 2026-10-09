// Nghiệp vụ xác thực cho 3 kênh (CONTRACT_V2 §2): Dashboard (cookie nhân viên), Portal (cookie khách),
// Mobile (Bearer + refresh token xoay vòng). Controller chỉ parse input → gọi hàm ở đây → trả HTTP.
//
// Quy tắc xuyên suốt:
//   - So mật khẩu LUÔN chạy bcrypt (kể cả khi không có user, với hash giả hợp lệ) để thời gian phản
//     hồi không lộ tài khoản nào tồn tại.
//   - Kiểm mật khẩu TRƯỚC khi lộ trạng thái khoá/vai trò: người không biết mật khẩu chỉ thấy 401.
//   - Audit không bao giờ chứa mật khẩu/token; không ghi định danh người gõ (có thể là mật khẩu gõ nhầm ô).
import bcrypt from "bcrypt";
import pool from "../../config/db";
import type { RequestMeta } from "../../lib/clientIp";
import { newUuid, randomTokenBase64Url, sha256Hex } from "../../lib/crypto";
import { isDuplicateKeyError, withTransaction, type Queryable } from "../../lib/db";
import { HttpError } from "../../lib/http";
import type { StaffRole, SystemRole } from "../../types/domain";
import { logEvent } from "../logs/logEvent";
import { notifyStaff } from "../notifications/notification.service";
import type { AuthChannel, AuthContext, AuthUserRow, MeUser, PortalName, TokenResponse } from "./auth.types";
import {
  bumpTokenVersion,
  createUserWithCustomer,
  findAuthUserById,
  findLoginUser,
  findRefreshTokenByHash,
  insertRefreshToken,
  markRefreshTokenRotated,
  revokeAllRefreshTokensOfUser,
  revokeRefreshFamily,
  touchLastLogin,
} from "./auth.repository";
import {
  REFRESH_TOKEN_TTL_SECONDS,
  SESSION_TTL_SECONDS,
  peekSessionUserId,
  signSessionToken,
  verifySessionToken,
  type SessionTokenType,
} from "./auth.tokens";
import { toAuthContext, toMeUser } from "./authContext";

const BCRYPT_COST = 12; // khớp cost của routes/users.ts và seed

// Hash bcrypt HỢP LỆ (cost 12) của một chuỗi cố định, tính 1 lần lúc nạp module (async, không chặn
// khởi động). Dùng khi tìm không ra user để compare tốn đúng thời gian như với user thật — hash "rác"
// như bản cũ khiến bcrypt trả false ngay lập tức, lộ được tài khoản nào tồn tại.
const DUMMY_HASH: Promise<string> = bcrypt.hash("dummy-password-for-timing-equalisation", BCRYPT_COST).catch(() => "");

function metaFields(meta: RequestMeta): { ip: string | null; userAgent: string | null } {
  return { ip: meta.ip, userAgent: meta.userAgent };
}

// ── Đăng nhập ──────────────────────────────────────────────────────────────

interface CredentialContext {
  allowUserTag: boolean;
  channel: AuthChannel;
  portal?: string;
  meta: RequestMeta;
}

/**
 * Xác minh mật khẩu và trạng thái tài khoản. Sai thông tin → 401 INVALID_CREDENTIALS (audit
 * LOGIN_FAILED); đúng mật khẩu nhưng tài khoản khoá → 403 ACCOUNT_LOCKED (audit ACCOUNT_LOCKED).
 */
async function verifyCredentials(identifier: string, password: string, ctx: CredentialContext) {
  const user = await findLoginUser(identifier, ctx.allowUserTag);
  const hash = user?.password_hash ?? (await DUMMY_HASH);
  const valid = await bcrypt.compare(password, hash);

  if (!user || !valid) {
    await logEvent({
      eventType: "LOGIN_FAILED",
      actorUserId: user?.id ?? null,
      message: "Đăng nhập thất bại: sai thông tin đăng nhập",
      ...metaFields(ctx.meta),
      details: { channel: ctx.channel, portal: ctx.portal ?? null, reason: "bad_credentials" },
    });
    throw new HttpError(401, "INVALID_CREDENTIALS");
  }
  if (user.status === "locked") {
    await logEvent({
      eventType: "ACCOUNT_LOCKED",
      actorUserId: user.id,
      message: "Tài khoản đã bị khoá nhưng vẫn cố đăng nhập",
      ...metaFields(ctx.meta),
      details: { channel: ctx.channel, portal: ctx.portal ?? null },
    });
    throw new HttpError(403, "ACCOUNT_LOCKED");
  }
  return user;
}

export interface SessionResult {
  user: MeUser;
  /** JWT đặt vào cookie `sh_<portal>`. */
  token: string;
  portal: PortalName;
  ttlSeconds: number;
}

/**
 * Đăng nhập Dashboard (ADMIN/OPERATOR). Tài khoản USER → 403 USE_MOBILE_APP + audit LOGIN_WRONG_CHANNEL
 * (FR-1.4); nhân viên chọn sai cổng → 403 WRONG_PORTAL. Cả hai trường hợp KHÔNG cấp cookie.
 */
export async function loginDashboard(
  input: { identifier: string; password: string; portal: StaffRole },
  meta: RequestMeta
): Promise<SessionResult> {
  const user = await verifyCredentials(input.identifier, input.password, {
    allowUserTag: false,
    channel: "dashboard",
    portal: input.portal,
    meta,
  });

  if (user.role === "user") {
    await logEvent({
      eventType: "LOGIN_WRONG_CHANNEL",
      actorUserId: user.id,
      message: "Khách hàng cố đăng nhập vào Dashboard nhân viên",
      ...metaFields(meta),
      details: { channel: "dashboard", portal: input.portal, role: user.role },
    });
    throw new HttpError(403, "USE_MOBILE_APP", "Customer accounts must use the mobile app", { role: "user" });
  }
  if (user.role !== input.portal) {
    await logEvent({
      eventType: "LOGIN_WRONG_CHANNEL",
      actorUserId: user.id,
      message: `Nhân viên (${user.role}) đăng nhập nhầm cổng ${input.portal}`,
      ...metaFields(meta),
      details: { channel: "dashboard", portal: input.portal, role: user.role, reason: "role_mismatch" },
    });
    throw new HttpError(403, "WRONG_PORTAL", "Account role does not match this portal", { role: user.role });
  }

  await touchLastLogin(user.id);
  const me = toMeUser(user);
  await logEvent({
    eventType: "LOGIN_SUCCESS",
    actorUserId: user.id,
    message: `Đăng nhập Dashboard (${user.role})`,
    ...metaFields(meta),
    details: { channel: "dashboard" },
  });

  // Hành vi cũ của /api/auth/login: Operator đăng nhập → báo cho admin
  if (user.role === "operator") {
    void notifyStaff({
      targetRole: "admin",
      type: "LOGIN",
      title: "Operator đã đăng nhập",
      message: `Operator ${me.username} đã đăng nhập hệ thống`,
      severity: "info",
      actor: { id: user.id, username: me.username, role: user.role },
    });
  }

  return {
    user: me,
    token: signSessionToken(user, "dashboard"),
    portal: user.role,
    ttlSeconds: SESSION_TTL_SECONDS.dashboard,
  };
}

/**
 * Đăng nhập khách hàng (Portal hoặc Mobile). `identifier` là email hoặc user_tag. Nhân viên đăng nhập
 * nhầm kênh: Portal → 403 WRONG_PORTAL, Mobile → 403 USE_DASHBOARD (không cấp token).
 */
export async function loginCustomer(
  identifier: string,
  password: string,
  channel: "portal" | "mobile",
  meta: RequestMeta
): Promise<AuthUserRow> {
  const user = await verifyCredentials(identifier, password, { allowUserTag: true, channel, meta });

  if (user.role !== "user") {
    await logEvent({
      eventType: "LOGIN_WRONG_CHANNEL",
      actorUserId: user.id,
      message: `Tài khoản nhân viên (${user.role}) đăng nhập vào kênh khách hàng (${channel})`,
      ...metaFields(meta),
      details: { channel, role: user.role },
    });
    throw channel === "mobile"
      ? new HttpError(403, "USE_DASHBOARD", "Staff accounts must use the dashboard", { role: user.role })
      : new HttpError(403, "WRONG_PORTAL", "Staff accounts cannot sign in to the customer portal", { role: user.role });
  }

  await touchLastLogin(user.id);
  await logEvent({
    eventType: "LOGIN_SUCCESS",
    actorUserId: user.id,
    message: `Đăng nhập khách hàng (${channel})`,
    ...metaFields(meta),
    details: { channel },
  });
  return user;
}

/** Cookie phiên Portal cho khách đã xác thực. */
export function createPortalSession(user: AuthUserRow): SessionResult {
  return {
    user: toMeUser(user),
    token: signSessionToken(user, "portal"),
    portal: "user",
    ttlSeconds: SESSION_TTL_SECONDS.portal,
  };
}

// ── Đăng ký khách hàng ─────────────────────────────────────────────────────

export interface RegisterInput {
  /** Đã chuẩn hoá: chữ thường, ≤ 190 ký tự. */
  email: string;
  password: string;
  fullName: string;
  phone: string | null;
}

/**
 * Đăng ký khách hàng (Portal/Mobile): users + customers trong MỘT transaction (invariant 9),
 * user_tag duy nhất. Email đã có → 409 EMAIL_TAKEN. Trả người dùng vừa tạo (chưa đăng nhập —
 * controller cấp phiên tiếp).
 */
export async function registerCustomer(input: RegisterInput, channel: "portal" | "mobile", meta: RequestMeta): Promise<AuthUserRow> {
  const passwordHash = await bcrypt.hash(input.password, BCRYPT_COST);

  let userId: number;
  try {
    const created = await withTransaction((conn) =>
      createUserWithCustomer(conn, {
        email: input.email,
        passwordHash,
        fullName: input.fullName,
        phone: input.phone,
      })
    );
    userId = created.userId;
  } catch (err) {
    if (isDuplicateKeyError(err, "uq_users_email")) throw new HttpError(409, "EMAIL_TAKEN", "Email is already registered");
    throw err;
  }

  await logEvent({
    eventType: "REGISTER",
    actorUserId: userId,
    message: "Khách hàng đăng ký tài khoản mới",
    ...metaFields(meta),
    details: { channel },
  });

  const user = await findAuthUserById(userId);
  if (!user) throw new Error("registerCustomer: created user could not be read back");
  return user;
}

// ── Mobile: access token + refresh token xoay vòng ─────────────────────────

async function issueRefreshToken(
  db: Queryable,
  userId: number,
  familyId: string,
  meta: RequestMeta
): Promise<{ token: string; id: number }> {
  const token = randomTokenBase64Url(32);
  const id = await insertRefreshToken(db, {
    userId,
    tokenHash: sha256Hex(token),
    familyId,
    expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000),
    userAgent: meta.userAgent,
    ip: meta.ip,
  });
  return { token, id };
}

function buildTokenResponse(user: AuthUserRow, refreshToken: string): TokenResponse {
  return {
    access_token: signSessionToken(user, "access"),
    refresh_token: refreshToken,
    token_type: "Bearer",
    expires_in: SESSION_TTL_SECONDS.access,
    refresh_expires_in: REFRESH_TOKEN_TTL_SECONDS,
    user: toMeUser(user),
  };
}

/** Mở phiên Mobile mới (family_id mới): trả access token + refresh token (bản rõ, chỉ trả lúc này). */
export async function startMobileSession(user: AuthUserRow, meta: RequestMeta): Promise<TokenResponse> {
  const { token } = await issueRefreshToken(pool, user.id, newUuid(), meta);
  return buildTokenResponse(user, token);
}

type RefreshOutcome =
  | { kind: "ok"; user: AuthUserRow; refreshToken: string }
  | { kind: "unknown" }
  | { kind: "expired" }
  | { kind: "reused"; userId: number }
  | { kind: "locked"; userId: number }
  | { kind: "wrong_role"; userId: number; role: SystemRole };

/**
 * Đổi refresh token lấy cặp token mới (xoay vòng). Token cũ bị thu hồi và trỏ `replaced_by_id` sang
 * token mới. Dùng lại token ĐÃ thu hồi (kẻ trộm hoặc client lỗi) → thu hồi CẢ họ token + audit
 * REFRESH_TOKEN_REUSED (critical) + 401 REFRESH_TOKEN_REUSED. Client phải gọi refresh đơn luồng
 * (single-flight): hai refresh song song cùng một token sẽ bị coi là dùng lại.
 */
export async function refreshMobileSession(refreshToken: string, meta: RequestMeta): Promise<TokenResponse> {
  const tokenHash = sha256Hex(refreshToken);

  // Quyết định trong transaction, nhưng THROW sau khi commit — nếu throw trong transaction thì
  // việc thu hồi họ token (cần được giữ lại) cũng bị rollback.
  const outcome = await withTransaction<RefreshOutcome>(async (conn) => {
    const row = await findRefreshTokenByHash(tokenHash, conn, true);
    if (!row) return { kind: "unknown" };

    if (row.is_revoked) {
      await revokeRefreshFamily(conn, row.family_id);
      return { kind: "reused", userId: row.user_id };
    }
    if (row.is_expired) return { kind: "expired" };

    const user = await findAuthUserById(row.user_id, conn);
    if (!user) return { kind: "unknown" };
    if (user.status === "locked") {
      await revokeRefreshFamily(conn, row.family_id);
      return { kind: "locked", userId: user.id };
    }
    if (user.role !== "user") return { kind: "wrong_role", userId: user.id, role: user.role };

    const next = await issueRefreshToken(conn, row.user_id, row.family_id, meta);
    await markRefreshTokenRotated(conn, row.id, next.id);
    return { kind: "ok", user, refreshToken: next.token };
  });

  switch (outcome.kind) {
    case "ok":
      return buildTokenResponse(outcome.user, outcome.refreshToken);
    case "unknown":
      throw new HttpError(401, "INVALID_REFRESH_TOKEN");
    case "expired":
      throw new HttpError(401, "REFRESH_TOKEN_EXPIRED");
    case "locked":
      throw new HttpError(403, "ACCOUNT_LOCKED");
    case "wrong_role":
      throw new HttpError(403, "USE_DASHBOARD", "Staff accounts must use the dashboard", { role: outcome.role });
    case "reused":
      await logEvent({
        eventType: "REFRESH_TOKEN_REUSED",
        actorUserId: outcome.userId,
        message: "Phát hiện dùng lại refresh token đã thu hồi — đã thu hồi toàn bộ phiên đăng nhập liên quan",
        ...metaFields(meta),
        details: { channel: "mobile" },
      });
      throw new HttpError(401, "REFRESH_TOKEN_REUSED");
  }
}

/**
 * Đăng xuất Mobile: thu hồi cả họ refresh token (FR-1.5). Không cần access token còn hạn. Token lạ →
 * im lặng coi như đã đăng xuất (idempotent, không cho dò token).
 */
export async function logoutMobileSession(refreshToken: string, meta: RequestMeta): Promise<void> {
  const row = await findRefreshTokenByHash(sha256Hex(refreshToken));
  if (!row) return;
  await revokeRefreshFamily(pool, row.family_id);
  await logEvent({
    eventType: "LOGOUT",
    actorUserId: row.user_id,
    message: "Đăng xuất Mobile",
    ...metaFields(meta),
    details: { channel: "mobile" },
  });
}

/**
 * Thu hồi mọi phiên của user — gọi khi đổi mật khẩu (`POST /me/password`) hoặc khoá tài khoản: thu hồi refresh
 * token mobile VÀ tăng token_version để cookie/access token đang chạy mất hiệu lực ngay.
 */
export async function revokeAllRefreshTokens(userId: number): Promise<number> {
  await bumpTokenVersion(userId);
  return revokeAllRefreshTokensOfUser(userId);
}

/**
 * Đăng xuất kênh cookie: tăng token_version (vô hiệu MỌI phiên cookie/access token của user — đơn giản và
 * chấp nhận được) rồi ghi audit LOGOUT. Nhận token (có thể đã hết hạn nhưng đúng chữ ký) để biết ai đăng xuất.
 * Refresh token mobile cũng bị thu hồi để "đăng xuất" thật sự là đăng xuất mọi nơi.
 */
export async function auditCookieLogout(token: string | null, typ: SessionTokenType, channel: AuthChannel, meta: RequestMeta): Promise<void> {
  const userId = token ? peekSessionUserId(token, typ) : null;
  if (userId === null) return;
  await bumpTokenVersion(userId);
  await revokeAllRefreshTokensOfUser(userId);
  await logEvent({
    eventType: "LOGOUT",
    actorUserId: userId,
    message: `Đăng xuất (${channel})`,
    ...metaFields(meta),
    details: { channel },
  });
}

// ── Xác thực mỗi request (dùng bởi middleware & WebSocket hub) ──────────────

/**
 * Nạp lại người dùng theo token đã verify và chặn tài khoản không còn hợp lệ: không tồn tại hoặc role
 * đã đổi từ lúc cấp token → 401 INVALID_TOKEN; đang bị khoá → 403 ACCOUNT_LOCKED.
 */
export async function loadSessionUser(userId: number, tokenRole: SystemRole, tokenVersion: number): Promise<AuthUserRow> {
  const user = await findAuthUserById(userId);
  // token_version lệch = phiên đã bị thu hồi (đổi mật khẩu, khoá, đăng xuất) → 401 như token sai
  if (!user || user.role !== tokenRole || Number(user.token_version) !== tokenVersion) throw new HttpError(401, "INVALID_TOKEN");
  if (user.status === "locked") throw new HttpError(403, "ACCOUNT_LOCKED");
  return user;
}

/**
 * Xác thực access token Mobile (Bearer). Dùng cho requireMobileUser và cho khung `auth` đầu tiên của
 * WebSocket (CONTRACT §4.3). Trả AuthContext + thời điểm token hết hạn (hub đóng socket 4401 khi đó).
 * Nhân viên cầm access token → 403 USE_DASHBOARD.
 */
export async function authenticateAccessToken(
  token: string
): Promise<{ auth: AuthContext; expiresAt: Date; tokenVersion: number }> {
  const verified = verifySessionToken(token, "access");
  const user = await loadSessionUser(verified.userId, verified.role, verified.tokenVersion);
  if (user.role !== "user") {
    throw new HttpError(403, "USE_DASHBOARD", "Staff accounts must use the dashboard", { role: user.role });
  }
  return { auth: toAuthContext(user, "mobile"), expiresAt: verified.expiresAt, tokenVersion: verified.tokenVersion };
}
