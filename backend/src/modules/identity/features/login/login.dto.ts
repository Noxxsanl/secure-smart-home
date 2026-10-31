// Input đăng nhập của 3 kênh. Mật khẩu: khoảng trắng là ký tự hợp lệ (trim: false); đăng nhập chỉ cần không rỗng.
import type { Request } from "express";
import { HttpError } from "../../../../shared/errors/http-error";
import { STAFF_ROLES, type StaffRole } from "../../../../shared/types/domain";
import { optionalEnum, requireString, type StringRule } from "../../../../shared/validation/validate";
import { bodyOf } from "../../domain/auth-request";
import { readPortalHeader } from "../../guards/auth.guards";

const LOGIN_PASSWORD_RULE: StringRule = { min: 1, max: 128, trim: false };
const LOGIN_NAME_RULE: StringRule = { min: 1, max: 190 };

/** POST /api/dashboard/auth/login  body { username, password, portal } */
export function parseDashboardLogin(req: Request): { identifier: string; password: string; portal: StaffRole } {
  const body = bodyOf(req);
  const identifier = requireString(body.username, "username", LOGIN_NAME_RULE);
  const password = requireString(body.password, "password", LOGIN_PASSWORD_RULE);

  // portal lấy từ body; nếu client chỉ gửi header X-Portal thì dùng header
  let portal: StaffRole | undefined = optionalEnum(body.portal, "portal", STAFF_ROLES);
  if (portal === undefined) {
    const header = readPortalHeader(req);
    portal = header !== null && (STAFF_ROLES as readonly string[]).includes(header) ? (header as StaffRole) : undefined;
  }
  if (portal === undefined) throw new HttpError(400, "MISSING_FIELDS", "portal is required");
  return { identifier, password, portal };
}

/** POST /api/{portal|mobile}/auth/login  body { email (hoặc user_tag), password } */
export function parseCustomerLogin(req: Request): { identifier: string; password: string } {
  const body = bodyOf(req);
  const identifier = requireString(body.email, "email", LOGIN_NAME_RULE);
  const password = requireString(body.password, "password", LOGIN_PASSWORD_RULE);
  return { identifier, password };
}
