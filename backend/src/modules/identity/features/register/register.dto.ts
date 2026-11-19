// Input đăng ký khách hàng (Portal/Mobile). Mật khẩu 8–128, khoảng trắng là ký tự hợp lệ (trim: false).
import type { Request } from "express";
import { optionalString, requireEmail, requireString, type StringRule } from "../../../../shared/validation/validate";
import { bodyOf } from "../../domain/auth-request";

const NEW_PASSWORD_RULE: StringRule = { min: 8, max: 128, trim: false };
const PHONE_RULE: StringRule = { min: 1, max: 20, pattern: /^[0-9 +.-]+$/ };

export interface RegisterInput {
  /** Đã chuẩn hoá: chữ thường, ≤ 190 ký tự. */
  email: string;
  password: string;
  fullName: string;
  phone: string | null;
}

export function parseRegister(req: Request): RegisterInput {
  const body = bodyOf(req);
  return {
    email: requireEmail(body.email),
    password: requireString(body.password, "password", NEW_PASSWORD_RULE),
    fullName: requireString(body.full_name, "full_name", { min: 2, max: 128 }),
    phone: optionalString(body.phone, "phone", PHONE_RULE) ?? null,
  };
}
