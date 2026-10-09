// SQL thành viên & lời mời (smart_home_members, member_device_access).
// Lời mời đang chờ = user_id NULL + invite_email; thành viên hiệu lực = user_id set và chưa hết hạn.
import { placeholders, queryOne, queryRows, runSql, type Queryable, type SqlParam } from "../../../lib/db";
import type { MemberRole } from "../../../types/domain";

export interface MemberListRow {
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
  user_email: string | null;
  user_name: string | null;
}

const MEMBER_LIST_SQL = `
  SELECT m.id, m.home_id, m.user_id, m.member_role, m.display_name, m.invite_email, m.invite_expires_at,
         m.expires_at, m.accepted_at, m.created_at, u.email AS user_email,
         COALESCE(c.full_name, u.full_name) AS user_name
    FROM smart_home_members m
    LEFT JOIN users u ON u.id = m.user_id
    LEFT JOIN customers c ON c.user_id = m.user_id`;

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

/** member_id → danh sách thiết bị GUEST được cấp. */
export async function listGuestDeviceMap(memberIds: readonly number[], db?: Queryable): Promise<Map<number, number[]>> {
  const result = new Map<number, number[]>();
  if (memberIds.length === 0) return result;
  const rows = await queryRows<{ member_id: number; device_id: number }>(
    `SELECT member_id, device_id FROM member_device_access
      WHERE member_id IN (${placeholders(memberIds.length)}) ORDER BY device_id`,
    [...memberIds],
    db
  );
  for (const row of rows) {
    const list = result.get(row.member_id) ?? [];
    list.push(row.device_id);
    result.set(row.member_id, list);
  }
  return result;
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
  const row = await queryOne<{ id: number }>("SELECT id FROM users WHERE email = ? AND role = 'user'", [email]);
  return row?.id ?? null;
}

/** Có thành viên hiệu lực hoặc lời mời còn hạn mang email này trong nhà không. */
export async function emailAlreadyInHome(homeId: number, email: string): Promise<boolean> {
  const row = await queryOne<{ id: number }>(
    `SELECT m.id
       FROM smart_home_members m
       LEFT JOIN users u ON u.id = m.user_id
      WHERE m.home_id = ?
        AND ((m.user_id IS NOT NULL AND u.email = ? AND (m.expires_at IS NULL OR m.expires_at > NOW()))
          OR (m.user_id IS NULL AND m.invite_email = ? AND m.invite_expires_at > NOW()))
      LIMIT 1`,
    [homeId, email, email]
  );
  return row !== null;
}

/** Dọn dòng GUEST đã hết hạn của một user để mời lại không vướng unique (home_id, user_id). */
export async function deleteExpiredMemberRow(db: Queryable, homeId: number, userId: number): Promise<void> {
  await runSql(
    "DELETE FROM smart_home_members WHERE home_id = ? AND user_id = ? AND expires_at IS NOT NULL AND expires_at <= NOW()",
    [homeId, userId],
    db
  );
}

export interface NewInvite {
  homeId: number;
  email: string;
  name: string;
  role: MemberRole;
  invitedBy: number;
  expiresAt: Date | null;
  inviteExpiresAt: Date;
}

export async function insertInvite(db: Queryable, invite: NewInvite): Promise<number> {
  const result = await runSql(
    `INSERT INTO smart_home_members
       (home_id, user_id, member_role, display_name, invite_email, invite_expires_at, invited_by, expires_at)
     VALUES (?, NULL, ?, ?, ?, ?, ?, ?)`,
    [invite.homeId, invite.role, invite.name, invite.email, invite.inviteExpiresAt, invite.invitedBy, invite.expiresAt],
    db
  );
  return result.insertId;
}

export async function replaceGuestDevices(db: Queryable, memberId: number, deviceIds: readonly number[]): Promise<void> {
  await runSql("DELETE FROM member_device_access WHERE member_id = ?", [memberId], db);
  for (const deviceId of deviceIds) {
    await runSql("INSERT INTO member_device_access (member_id, device_id) VALUES (?, ?)", [memberId, deviceId], db);
  }
}

export async function updateMemberRow(
  db: Queryable,
  memberId: number,
  role: MemberRole,
  expiresAt: Date | null
): Promise<void> {
  await runSql("UPDATE smart_home_members SET member_role = ?, expires_at = ? WHERE id = ?", [role, expiresAt, memberId], db);
}

export async function deleteMember(db: Queryable, memberId: number): Promise<void> {
  await runSql("DELETE FROM smart_home_members WHERE id = ?", [memberId], db);
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
      WHERE m.user_id IS NULL AND m.invite_email = ? AND m.invite_expires_at > NOW()
        AND (m.expires_at IS NULL OR m.expires_at > NOW())
      ORDER BY m.created_at DESC, m.id DESC`,
    [email]
  );
}

export interface PendingInviteRow {
  id: number;
  home_id: number;
  member_role: MemberRole;
}

/** Khoá (FOR UPDATE) lời mời đang chờ của đúng email; null nếu không phải của tôi / hết hạn. */
export async function lockInviteForEmail(db: Queryable, inviteId: number, email: string): Promise<PendingInviteRow | null> {
  return queryOne<PendingInviteRow>(
    `SELECT id, home_id, member_role
       FROM smart_home_members
      WHERE id = ? AND user_id IS NULL AND invite_email = ? AND invite_expires_at > NOW()
        AND (expires_at IS NULL OR expires_at > NOW())
      FOR UPDATE`,
    [inviteId, email],
    db
  );
}

export async function activateInvite(db: Queryable, memberId: number, userId: number): Promise<void> {
  await runSql(
    `UPDATE smart_home_members
        SET user_id = ?, accepted_at = NOW(), invite_email = NULL, invite_expires_at = NULL
      WHERE id = ? AND user_id IS NULL`,
    [userId, memberId],
    db
  );
}

export async function hasEffectiveMembership(db: Queryable, homeId: number, userId: number): Promise<boolean> {
  const row = await queryOne<{ id: number }>(
    "SELECT id FROM smart_home_members WHERE home_id = ? AND user_id = ? AND (expires_at IS NULL OR expires_at > NOW())",
    [homeId, userId],
    db
  );
  return row !== null;
}

export async function deleteInviteForEmail(inviteId: number, email: string): Promise<{ home_id: number } | null> {
  const row = await queryOne<{ home_id: number }>(
    "SELECT home_id FROM smart_home_members WHERE id = ? AND user_id IS NULL AND invite_email = ?",
    [inviteId, email]
  );
  if (!row) return null;
  await runSql("DELETE FROM smart_home_members WHERE id = ? AND user_id IS NULL", [inviteId]);
  return row;
}
