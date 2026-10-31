// SQL thành viên & lời mời trên bảng của module (smart_home_members, member_device_access).
// Lời mời đang chờ = user_id NULL + invite_email; thành viên hiệu lực = user_id set và chưa hết hạn.
// Truy vấn kèm tên/email (JOIN users/customers) nằm ở members.read-model.ts.
import { placeholders, queryOne, queryRows, runSql, type Queryable } from "../../../infrastructure/database/db";
import type { MemberRole } from "../../../shared/types/domain";

// Email so bằng LOWER(col) = LOWER(?) vì PostgreSQL phân biệt hoa/thường (khớp unique index LOWER(email)).

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
     VALUES (?, NULL, ?, ?, ?, ?, ?, ?)
     RETURNING id`,
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
      WHERE id = ? AND user_id IS NULL AND LOWER(invite_email) = LOWER(?) AND invite_expires_at > NOW()
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
    "SELECT home_id FROM smart_home_members WHERE id = ? AND user_id IS NULL AND LOWER(invite_email) = LOWER(?)",
    [inviteId, email]
  );
  if (!row) return null;
  await runSql("DELETE FROM smart_home_members WHERE id = ? AND user_id IS NULL", [inviteId]);
  return row;
}
