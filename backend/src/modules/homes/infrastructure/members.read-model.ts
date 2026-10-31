// Read model thành viên & lời mời: danh sách thành viên kèm tên/email (JOIN users + customers), lọc thiết bị
// của nhà (devices), tra user theo email, danh sách lời mời của tôi. Đọc bảng module khác nên nằm ở
// *.read-model.ts (quy tắc T2); phần ghi thuần smart_home_members ở members.repository.ts.
import { placeholders, queryOne, queryRows, type Queryable, type SqlParam } from "../../../infrastructure/database/db";
import type { MemberRole } from "../../../shared/types/domain";
import type { MemberListRow } from "../domain/member.types";

const MEMBER_LIST_SQL = `
  SELECT m.id, m.home_id, m.user_id, m.member_role, m.display_name, m.invite_email, m.invite_expires_at,
         m.expires_at, m.accepted_at, m.created_at, u.email AS user_email,
         COALESCE(c.full_name, u.full_name) AS user_name
    FROM smart_home_members m
    LEFT JOIN users u ON u.id = m.user_id
    LEFT JOIN customers c ON c.user_id = m.user_id`;

// Email so bằng LOWER(col) = LOWER(?) vì PostgreSQL phân biệt hoa/thường (khớp unique index LOWER(email)).

/** Thành viên hiệu lực + lời mời còn hạn của nhà (OWNER đứng đầu). */
export async function listHomeMembers(homeId: number, onlyMemberId?: number, db?: Queryable): Promise<MemberListRow[]> {
  const params: SqlParam[] = [homeId];
  let filter = "";
  if (onlyMemberId !== undefined) {
    filter = "AND m.id = ?";
    params.push(onlyMemberId);
  }
  return queryRows<MemberListRow>(
    `${MEMBER_LIST_SQL}
      WHERE m.home_id = ? ${filter}
        AND ((m.user_id IS NOT NULL AND (m.expires_at IS NULL OR m.expires_at > NOW()))
          OR (m.user_id IS NULL AND m.invite_email IS NOT NULL AND m.invite_expires_at > NOW()))
      ORDER BY (m.member_role = 'OWNER') DESC, m.created_at, m.id`,
    params,
    db
  );
}

export async function getMemberRow(memberId: number, db?: Queryable): Promise<MemberListRow | null> {
  return queryOne<MemberListRow>(`${MEMBER_LIST_SQL} WHERE m.id = ?`, [memberId], db);
}

/** Trong các id truyền vào, những id là thiết bị (không phải gateway) của nhà. */
export async function filterHomeDeviceIds(homeId: number, ids: readonly number[]): Promise<number[]> {
  if (ids.length === 0) return [];
  const rows = await queryRows<{ id: number }>(
    `SELECT id FROM devices WHERE home_id = ? AND device_type <> 'gateway' AND id IN (${placeholders(ids.length)})`,
    [homeId, ...ids]
  );
  return rows.map((row) => row.id);
}

export async function findUserIdByEmail(email: string): Promise<number | null> {
  const row = await queryOne<{ id: number }>("SELECT id FROM users WHERE LOWER(email) = LOWER(?) AND role = 'user'", [email]);
  return row?.id ?? null;
}

/** Có thành viên hiệu lực hoặc lời mời còn hạn mang email này trong nhà không. */
export async function emailAlreadyInHome(homeId: number, email: string): Promise<boolean> {
  const row = await queryOne<{ id: number }>(
    `SELECT m.id
       FROM smart_home_members m
       LEFT JOIN users u ON u.id = m.user_id
      WHERE m.home_id = ?
        AND ((m.user_id IS NOT NULL AND LOWER(u.email) = LOWER(?) AND (m.expires_at IS NULL OR m.expires_at > NOW()))
          OR (m.user_id IS NULL AND LOWER(m.invite_email) = LOWER(?) AND m.invite_expires_at > NOW()))
      LIMIT 1`,
    [homeId, email, email]
  );
  return row !== null;
}

// ── Lời mời của tôi ────────────────────────────────────────────────────────

export interface InvitationRow {
  id: number;
  home_id: number;
  home_name: string;
  home_address: string | null;
  member_role: MemberRole;
  invited_by_name: string | null;
  invite_expires_at: Date;
  expires_at: Date | null;
}

export async function listInvitationsForEmail(email: string): Promise<InvitationRow[]> {
  return queryRows<InvitationRow>(
    `SELECT m.id, m.home_id, h.name AS home_name, h.address AS home_address, m.member_role,
            COALESCE(ic.full_name, iu.full_name, iu.username) AS invited_by_name,
            m.invite_expires_at, m.expires_at
       FROM smart_home_members m
       JOIN smart_homes h ON h.id = m.home_id
       LEFT JOIN users iu ON iu.id = m.invited_by
       LEFT JOIN customers ic ON ic.user_id = m.invited_by
      WHERE m.user_id IS NULL AND LOWER(m.invite_email) = LOWER(?) AND m.invite_expires_at > NOW()
        AND (m.expires_at IS NULL OR m.expires_at > NOW())
      ORDER BY m.created_at DESC, m.id DESC`,
    [email]
  );
}
