// Nghiệp vụ đăng nhập 3 kênh (CONTRACT_V2 §2): Dashboard (cookie nhân viên), Portal (cookie khách), Mobile (Bearer).
// Controller chỉ parse input → gọi hàm ở đây → trả HTTP.
//
// Quy tắc xuyên suốt:
//   - So mật khẩu LUÔN chạy bcrypt (kể cả khi không có user, với hash giả hợp lệ) để thời gian phản
//     hồi không lộ tài khoản nào tồn tại.
//   - Kiểm mật khẩu TRƯỚC khi lộ trạng thái khoá/vai trò: người không biết mật khẩu chỉ thấy 401.
//   - Audit không bao giờ chứa mật khẩu/token; không ghi định danh người gõ (có thể là mật khẩu gõ nhầm ô).
import bcrypt from "bcrypt";
import type { AuthChannel } from "../../../../core/auth/auth-context";
import type { RequestMeta } from "../../../../core/http/request-meta";
import { HttpError } from "../../../../shared/errors/http-error";
import type { StaffRole } from "../../../../shared/types/domain";
import { logEvent } from "../../../audit";
import { notifyStaff } from "../../../notifications";
import type { AuthUserRow, SessionResult } from "../../domain/auth.types";
import { metaFields } from "../../domain/auth-request";
import { toMeUser } from "../../domain/auth-user.mapper";
import { BCRYPT_COST } from "../../domain/password-policy";
import { SESSION_TTL_SECONDS, signSessionToken } from "../../domain/session-tokens";
import { findLoginUser, touchLastLogin } from "../../infrastructure/auth.repository";

// Hash bcrypt HỢP LỆ (cost 12) của một chuỗi cố định, tính 1 lần lúc nạp module (async, không chặn
// khởi động). Dùng khi tìm không ra user để compare tốn đúng thời gian như với user thật — hash "rác"
// như bản cũ khiến bcrypt trả false ngay lập tức, lộ được tài khoản nào tồn tại.
const DUMMY_HASH: Promise<string> = bcrypt.hash("dummy-password-for-timing-equalisation", BCRYPT_COST).catch(() => "");

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
