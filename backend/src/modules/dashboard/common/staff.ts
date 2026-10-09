// Helper dùng chung cho Dashboard API: kiểm role ADMIN, phạm vi dữ liệu của Operator (FR-9.6),
// escape LIKE, viết tắt tên. Không chứa SQL nghiệp vụ — chỉ 1 truy vấn grant.
import { forbidden } from "../../../lib/http";
import { queryRows } from "../../../lib/db";
import type { AuthContext } from "../../auth/auth.types";

/** Chỉ ADMIN — ném 403 FORBIDDEN cho OPERATOR. */
export function requireAdmin(auth: AuthContext): void {
  if (auth.role !== "admin") throw forbidden("Admin role required");
}

/** Phạm vi xem dữ liệu khách của nhân viên: ADMIN không giới hạn; OPERATOR cần grant theo từng nhà. */
export interface StaffScope {
  unrestricted: boolean;
  grantedHomeIds: ReadonlySet<number>;
}

export async function loadStaffScope(auth: AuthContext): Promise<StaffScope> {
  if (auth.role === "admin") return { unrestricted: true, grantedHomeIds: new Set() };
  const rows = await queryRows<{ home_id: number }>(
    `SELECT DISTINCT home_id FROM operator_home_access
      WHERE operator_user_id = ? AND revoked_at IS NULL AND expires_at > NOW()`,
    [auth.userId]
  );
  return { unrestricted: false, grantedHomeIds: new Set(rows.map((row) => row.home_id)) };
}

/**
 * Được xem dữ liệu khách của nhà không? Thiết bị chưa gán nhà (home null) và nhà chưa claim luôn được;
 * nhà đã claim cần grant (Operator).
 */
export function canSeeCustomerData(scope: StaffScope, home: { id: number | null; status: string | null }): boolean {
  if (scope.unrestricted || home.id === null || home.status === null || home.status === "unclaimed") return true;
  return scope.grantedHomeIds.has(home.id);
}

/**
 * Chuỗi tìm kiếm → mẫu LIKE `%…%` đã escape `\`, `%`, `_` (dùng với tham số `?`). Mọi câu LIKE dùng mẫu này
 * dựa vào ký tự escape mặc định `\` của MySQL (session không bật NO_BACKSLASH_ESCAPES) nên không cần ESCAPE.
 */
export function likePattern(text: string): string {
  return `%${text.replace(/[\\%_]/g, (c) => "\\" + c)}%`;
}

/** `dat@gmail.com` → `d***@gmail.com`. */
export function maskEmail(email: string | null): string | null {
  if (email === null) return null;
  const at = email.lastIndexOf("@");
  if (at < 1) return "***";
  return `${Array.from(email.slice(0, at))[0]}***${email.slice(at)}`;
}

/** `0912345678` → `09******78` (giữ 2 ký tự đầu và 2 ký tự cuối; số quá ngắn che hết). */
export function maskPhone(phone: string | null): string | null {
  if (phone === null) return null;
  const chars = Array.from(phone);
  if (chars.length <= 4) return "*".repeat(chars.length);
  return chars.slice(0, 2).join("") + "*".repeat(chars.length - 4) + chars.slice(-2).join("");
}

/** Che liên hệ khách (email/phone/address); giữ name + user_tag cho luồng gán chủ nhà. */
export function maskCustomerContact<T extends { email: string | null; phone: string | null; address: string | null }>(customer: T): T {
  return { ...customer, email: maskEmail(customer.email), phone: maskPhone(customer.phone), address: null };
}

/** "Nguyễn Hoàng Đạt" → "NĐ" (chữ cái đầu của 2 từ cuối). */
export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const picked = words.length <= 2 ? words : words.slice(-2);
  return picked.map((word) => Array.from(word)[0]?.toUpperCase() ?? "").join("") || "?";
}
