// SQL khách hàng cho console: danh sách, chi tiết, bảo hành (claimed_at + 12 tháng), lịch sử kích hoạt.
import { placeholders, queryOne, queryRows, sqlLimit, toIso, toIsoRequired, type Queryable, type SqlParam } from "../../../lib/db";
import pool from "../../../config/db";
import type { PackageCode } from "../../../types/domain";
import { likePattern } from "../common/staff";
import type { ActivationRecord, Customer, Warranty } from "../dashboard.types";

interface CustomerRow {
  id: number;
  user_id: number;
  full_name: string;
  user_tag: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  created_at: Date;
  user_status: "active" | "locked";
  last_login: Date | null;
  homes_count: unknown;
}

// homes_count = số nhà mà khách là thành viên hiệu lực (kể cả chủ nhà)
const CUSTOMER_SELECT_SQL = `
  SELECT c.id, c.user_id, c.full_name, c.user_tag, u.email, c.phone, c.address, c.created_at,
         u.status AS user_status, u.last_login,
         (SELECT COUNT(*) FROM smart_home_members m
           WHERE m.user_id = c.user_id AND (m.expires_at IS NULL OR m.expires_at > NOW())) AS homes_count
    FROM customers c
    JOIN users u ON u.id = c.user_id`;

export function toCustomer(row: CustomerRow): Customer {
  return {
    id: row.id,
    user_id: row.user_id,
    name: row.full_name,
    user_tag: row.user_tag,
    email: row.email,
    phone: row.phone,
    address: row.address,
    joined_at: toIsoRequired(row.created_at),
    status: row.user_status === "active" ? "active" : "inactive",
    homes_count: Number(row.homes_count ?? 0),
    last_login: toIso(row.last_login),
  };
}

/**
 * Tập user_id (trong `userIds`) là thành viên hiệu lực của ít nhất một nhà trong `homeIds` — dùng để biết
 * Operator có grant cho "ít nhất một nhà của khách" (mở che email/phone/address).
 */
export async function listUserIdsInHomes(homeIds: readonly number[], userIds: readonly number[]): Promise<Set<number>> {
  if (homeIds.length === 0 || userIds.length === 0) return new Set();
  const rows = await queryRows<{ user_id: number }>(
    `SELECT DISTINCT m.user_id FROM smart_home_members m
      WHERE m.home_id IN (${placeholders(homeIds.length)}) AND m.user_id IN (${placeholders(userIds.length)})
        AND (m.expires_at IS NULL OR m.expires_at > NOW())`,
    [...homeIds, ...userIds]
  );
  return new Set(rows.map((row) => row.user_id));
}

/** `contactSearch=false` (Operator): chỉ tìm theo tên/user_tag — nếu không, LIKE trên email/phone bị dùng làm oracle dò dữ liệu đã che. */
export async function listCustomers(q: string | undefined, contactSearch = true): Promise<Customer[]> {
  const params: SqlParam[] = [];
  let where = "";
  if (q !== undefined) {
    const pattern = likePattern(q);
    if (contactSearch) {
      where = "WHERE (c.full_name LIKE ? OR c.user_tag LIKE ? OR u.email LIKE ? OR c.phone LIKE ?)";
      params.push(pattern, pattern, pattern, pattern);
    } else {
      where = "WHERE (c.full_name LIKE ? OR c.user_tag LIKE ?)";
      params.push(pattern, pattern);
    }
  }
  const rows = await queryRows<CustomerRow>(`${CUSTOMER_SELECT_SQL} ${where} ORDER BY c.id DESC LIMIT 500`, params);
  return rows.map(toCustomer);
}

export async function getCustomerById(id: number, db: Queryable = pool): Promise<Customer | null> {
  const row = await queryOne<CustomerRow>(`${CUSTOMER_SELECT_SQL} WHERE c.id = ?`, [id], db);
  return row ? toCustomer(row) : null;
}

export async function getCustomerByUserId(userId: number, db: Queryable = pool): Promise<Customer | null> {
  const row = await queryOne<CustomerRow>(`${CUSTOMER_SELECT_SQL} WHERE c.user_id = ?`, [userId], db);
  return row ? toCustomer(row) : null;
}

/** user_tag so khớp không phân biệt hoa/thường (collation utf8mb4_unicode_ci); chỉ tài khoản đang active. */
export async function findCustomerByTag(userTag: string): Promise<Customer | null> {
  const row = await queryOne<CustomerRow>(`${CUSTOMER_SELECT_SQL} WHERE c.user_tag = ? AND u.status = 'active'`, [userTag]);
  return row ? toCustomer(row) : null;
}

export async function findActiveCustomerById(id: number): Promise<Customer | null> {
  const row = await queryOne<CustomerRow>(`${CUSTOMER_SELECT_SQL} WHERE c.id = ? AND u.status = 'active'`, [id]);
  return row ? toCustomer(row) : null;
}

/** Nhà khách là chủ → bảo hành 12 tháng kể từ ngày claim. */
export async function listWarranties(userId: number): Promise<Warranty[]> {
  const rows = await queryRows<{ id: number; name: string; package_code: PackageCode; claimed_at: Date }>(
    `SELECT id, name, package_code, claimed_at FROM smart_homes
      WHERE owner_user_id = ? AND claimed_at IS NOT NULL ORDER BY claimed_at DESC`,
    [userId]
  );
  return rows.map((row) => {
    const end = new Date(row.claimed_at.getTime());
    end.setUTCMonth(end.getUTCMonth() + 12);
    return {
      id: row.id,
      home_id: row.id,
      home_name: row.name,
      package: row.package_code,
      starts_at: toIsoRequired(row.claimed_at),
      expires_at: end.toISOString(),
    };
  });
}

interface ActivationRow {
  id: number;
  customer_id: number | null;
  customer_name: string | null;
  home_id: number | null;
  home_name: string | null;
  created_at: Date;
  result: "success" | "failed";
  method: "qr" | "code" | "operator_assign";
  reason: string | null;
}

const ACTIVATION_SELECT_SQL = `
  SELECT l.id, c.id AS customer_id, c.full_name AS customer_name, l.home_id, h.name AS home_name,
         l.created_at, l.result, l.method, l.reason
    FROM activation_logs l
    LEFT JOIN customers c ON c.user_id = l.user_id
    LEFT JOIN smart_homes h ON h.id = l.home_id`;

function toActivation(row: ActivationRow): ActivationRecord {
  return {
    id: row.id,
    customer_id: row.customer_id,
    customer_name: row.customer_name,
    home_id: row.home_id,
    home_name: row.home_name,
    activated_at: toIsoRequired(row.created_at),
    result: row.result,
    method: row.method,
    reason: row.reason,
  };
}

export async function listActivationsForUser(userId: number, limit: number): Promise<ActivationRecord[]> {
  const rows = await queryRows<ActivationRow>(`${ACTIVATION_SELECT_SQL} WHERE l.user_id = ? ORDER BY l.id DESC LIMIT ?`, [
    userId,
    sqlLimit(limit),
  ]);
  return rows.map(toActivation);
}

export async function listRecentActivations(limit: number): Promise<ActivationRecord[]> {
  const rows = await queryRows<ActivationRow>(`${ACTIVATION_SELECT_SQL} ORDER BY l.id DESC LIMIT ?`, [sqlLimit(limit)]);
  return rows.map(toActivation);
}
