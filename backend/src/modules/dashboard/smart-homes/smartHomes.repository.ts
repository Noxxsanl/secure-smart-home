// SQL của Smart Homes cho console: hàng danh sách (SmartHomeRow), thành viên, timeline, trạng thái mã
// kích hoạt, cập nhật nhà, activation_logs. Mã kích hoạt chỉ đọc TRẠNG THÁI (không bao giờ hash/bản rõ).
import pool from "../../../config/db";
import {
  placeholders,
  queryOne,
  queryRows,
  runSql,
  sqlLimit,
  toCount,
  toIso,
  toIsoRequired,
  type Queryable,
  type SqlParam,
} from "../../../lib/db";
import { isOnline } from "../../../lib/time";
import type { HomeStatus, MemberRole, PackageCode } from "../../../types/domain";
import { TIMELINE_CATEGORIES, timelineLabel } from "../../homes/timeline";
import { initialsOf, likePattern } from "../common/staff";
import type { ConsoleMember, HomeActivationInfo, SmartHomeRow, TimelineEvent } from "../dashboard.types";

// ── SmartHomeRow ───────────────────────────────────────────────────────────

interface HomeSummaryDbRow {
  id: number;
  name: string;
  address: string | null;
  package_code: PackageCode;
  status: HomeStatus;
  created_at: Date;
  claimed_at: Date | null;
  owner_customer_id: number | null;
  owner_name: string | null;
  gateway_id: number | null;
  gateway_uid: string | null;
  gateway_last_seen: Date | null;
  room_count: unknown;
  device_count: unknown;
}

// device_count không tính gateway (cùng quy ước RoomSummary)
const HOME_SUMMARY_SQL = `
  SELECT h.id, h.name, h.address, h.package_code, h.status, h.created_at, h.claimed_at,
         oc.id AS owner_customer_id, oc.full_name AS owner_name,
         g.id AS gateway_id, g.device_id AS gateway_uid, g.last_seen AS gateway_last_seen,
         (SELECT COUNT(*) FROM rooms r WHERE r.home_id = h.id) AS room_count,
         (SELECT COUNT(*) FROM devices d WHERE d.home_id = h.id AND d.device_type <> 'gateway') AS device_count
    FROM smart_homes h
    LEFT JOIN customers oc ON oc.user_id = h.owner_user_id
    LEFT JOIN devices g ON g.id = (
      SELECT g2.id FROM devices g2 WHERE g2.home_id = h.id AND g2.device_type = 'gateway' ORDER BY g2.id LIMIT 1
    )`;

export function toHomeRow(row: HomeSummaryDbRow): SmartHomeRow {
  return {
    id: row.id,
    name: row.name,
    address: row.address,
    package: row.package_code,
    status: row.status,
    owner_customer_id: row.owner_customer_id,
    owner_name: row.owner_name,
    gateway_id: row.gateway_id,
    gateway_uid: row.gateway_uid,
    gateway_online: row.gateway_id === null ? null : isOnline(row.gateway_last_seen),
    room_count: toCount(row.room_count),
    device_count: toCount(row.device_count),
    created_at: toIsoRequired(row.created_at),
    activated_at: toIso(row.claimed_at),
  };
}

export interface HomeListFilter {
  status?: HomeStatus;
  q?: string;
  /** Nhà mà user này là thành viên hiệu lực (chi tiết khách hàng). */
  memberUserId?: number;
  limit?: number;
}

export async function listHomeRows(filter: HomeListFilter, db: Queryable = pool): Promise<SmartHomeRow[]> {
  const clauses: string[] = [];
  const params: SqlParam[] = [];
  if (filter.status !== undefined) {
    clauses.push("h.status = ?");
    params.push(filter.status);
  }
  if (filter.q !== undefined) {
    const pattern = likePattern(filter.q);
    clauses.push("(h.name LIKE ? OR h.address LIKE ? OR oc.full_name LIKE ? OR g.device_id LIKE ?)");
    params.push(pattern, pattern, pattern, pattern);
  }
  if (filter.memberUserId !== undefined) {
    clauses.push(
      `EXISTS (SELECT 1 FROM smart_home_members m
                WHERE m.home_id = h.id AND m.user_id = ? AND (m.expires_at IS NULL OR m.expires_at > NOW()))`
    );
    params.push(filter.memberUserId);
  }
  const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
  const rows = await queryRows<HomeSummaryDbRow>(
    `${HOME_SUMMARY_SQL} ${where} ORDER BY h.id DESC LIMIT ?`,
    [...params, sqlLimit(filter.limit ?? 500)],
    db
  );
  return rows.map(toHomeRow);
}

export async function getHomeSummary(id: number, db: Queryable = pool): Promise<SmartHomeRow | null> {
  const row = await queryOne<HomeSummaryDbRow>(`${HOME_SUMMARY_SQL} WHERE h.id = ?`, [id], db);
  return row ? toHomeRow(row) : null;
}

/** Cột bổ sung của SmartHomeDetailHome (HomeRow không có tên chủ nhà / người tạo). */
export async function getHomeExtras(
  homeId: number,
  db: Queryable = pool
): Promise<{ owner_name: string | null; created_by_username: string | null }> {
  const row = await queryOne<{ owner_name: string | null; created_by_username: string | null }>(
    `SELECT oc.full_name AS owner_name, cu.username AS created_by_username
       FROM smart_homes h
       LEFT JOIN customers oc ON oc.user_id = h.owner_user_id
       LEFT JOIN users cu ON cu.id = h.created_by
      WHERE h.id = ?`,
    [homeId],
    db
  );
  return row ?? { owner_name: null, created_by_username: null };
}

// ── Thành viên / timeline / mã kích hoạt ───────────────────────────────────

interface MemberDbRow {
  id: number;
  home_id: number;
  user_id: number | null;
  member_role: MemberRole;
  display_name: string | null;
  invite_email: string | null;
  invite_expires_at: Date | null;
  expires_at: Date | null;
  accepted_at: Date | null;
  created_at: Date;
  full_name: string | null;
  email: string | null;
}

export async function listMembers(homeId: number): Promise<ConsoleMember[]> {
  const rows = await queryRows<MemberDbRow>(
    `SELECT m.id, m.home_id, m.user_id, m.member_role, m.display_name, m.invite_email, m.invite_expires_at,
            m.expires_at, m.accepted_at, m.created_at, c.full_name, u.email
       FROM smart_home_members m
       LEFT JOIN users u ON u.id = m.user_id
       LEFT JOIN customers c ON c.user_id = m.user_id
      WHERE m.home_id = ?
      ORDER BY FIELD(m.member_role, 'OWNER', 'CONTROLLER', 'VIEWER', 'GUEST'), m.id`,
    [homeId]
  );
  return rows.map((row): ConsoleMember => {
    const name = row.full_name ?? row.display_name ?? row.email ?? row.invite_email ?? "Thành viên";
    return {
      id: row.id,
      home_id: row.home_id,
      user_id: row.user_id,
      name,
      initials: initialsOf(name),
      email: row.email ?? row.invite_email,
      role: row.member_role,
      pending: row.user_id === null,
      invite_expires_at: toIso(row.invite_expires_at),
      expires_at: toIso(row.expires_at),
      joined_at: toIso(row.accepted_at ?? (row.user_id === null ? null : row.created_at)),
    };
  });
}

/** Timeline nhà: audit_log của nhà ở 3 category provision/activity/gateway, mới nhất trước. */
export async function listTimeline(homeId: number, limit: number): Promise<TimelineEvent[]> {
  const rows = await queryRows<{ id: number; event_type: string; message: string | null; created_at: Date }>(
    `SELECT id, event_type, message, created_at FROM audit_log
      WHERE home_id = ? AND category IN (${placeholders(TIMELINE_CATEGORIES.length)})
      ORDER BY id DESC LIMIT ?`,
    [homeId, ...TIMELINE_CATEGORIES, sqlLimit(limit)]
  );
  return rows.map((row) => ({
    id: row.id,
    timestamp: toIsoRequired(row.created_at),
    event_type: row.event_type,
    label: timelineLabel(row.event_type),
    description: row.message,
  }));
}

/** Trạng thái mã kích hoạt mới nhất của nhà (không đọc/trả hash). */
export async function getActivationInfo(homeId: number): Promise<HomeActivationInfo> {
  const row = await queryOne<{ expires_at: Date; used_at: Date | null; revoked_at: Date | null; created_at: Date }>(
    `SELECT expires_at, used_at, revoked_at, created_at FROM activation_tokens
      WHERE home_id = ? ORDER BY id DESC LIMIT 1`,
    [homeId]
  );
  if (!row) return { status: "none", expires_at: null, used_at: null, created_at: null };
  let status: HomeActivationInfo["status"] = "unused";
  if (row.used_at !== null) status = "used";
  else if (row.revoked_at !== null) status = "revoked";
  else if (row.expires_at.getTime() <= Date.now()) status = "expired";
  return {
    status,
    expires_at: toIsoRequired(row.expires_at),
    used_at: toIso(row.used_at),
    created_at: toIsoRequired(row.created_at),
  };
}

// ── Ghi ────────────────────────────────────────────────────────────────────

export interface HomePatch {
  name?: string;
  address?: string | null;
  status?: "active" | "suspended";
}

/** Cập nhật đúng các cột có trong patch (tên cột cố định, giá trị qua placeholder). */
export async function updateHome(id: number, patch: HomePatch): Promise<void> {
  const sets: string[] = [];
  const params: SqlParam[] = [];
  if (patch.name !== undefined) {
    sets.push("name = ?");
    params.push(patch.name);
  }
  if (patch.address !== undefined) {
    sets.push("address = ?");
    params.push(patch.address);
  }
  if (patch.status !== undefined) {
    sets.push("status = ?");
    params.push(patch.status);
  }
  if (sets.length === 0) return;
  await runSql(`UPDATE smart_homes SET ${sets.join(", ")} WHERE id = ?`, [...params, id]);
}

/** activation_logs (append-only, không FK) — Operator gán chủ nhà ghi method 'operator_assign'. */
export async function insertActivationLog(
  db: Queryable,
  input: {
    homeId: number;
    userId: number;
    method: "operator_assign";
    result: "success";
    ip: string | null;
    userAgent: string | null;
  }
): Promise<void> {
  await runSql(
    `INSERT INTO activation_logs (home_id, user_id, method, result, ip_address, user_agent)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [input.homeId, input.userId, input.method, input.result, input.ip, input.userAgent?.slice(0, 255) ?? null],
    db
  );
}
