// SQL của lớp phân quyền: thành viên hiệu lực, grant của Operator (thiết bị GUEST: access.read-model.ts).
// "Thành viên hiệu lực" = user_id đã gán VÀ (expires_at IS NULL OR expires_at > NOW()) — GUEST hết
// hạn coi như không phải thành viên (→ 404). Lời mời đang chờ (user_id NULL) không bao giờ khớp.
import pool from "../../../infrastructure/database/pool";
import { placeholders, queryOne, queryRows, type Queryable, type SqlParam } from "../../../infrastructure/database/db";
import type { MemberRole } from "../../../shared/types/domain";
import type { MemberRow, OperatorGrantRow } from "../domain/access.types";

const MEMBER_COLUMNS = `m.id, m.home_id, m.user_id, m.member_role, m.display_name, m.invite_email,
  m.invite_expires_at, m.invited_by, m.expires_at, m.accepted_at, m.created_at`;

export async function findEffectiveMember(homeId: number, userId: number, db: Queryable = pool): Promise<MemberRow | null> {
  return queryOne<MemberRow>(
    `SELECT ${MEMBER_COLUMNS}
       FROM smart_home_members m
      WHERE m.home_id = ? AND m.user_id = ? AND (m.expires_at IS NULL OR m.expires_at > NOW())`,
    [homeId, userId],
    db
  );
}

/** users.id của mọi thành viên hiệu lực của nhà (lọc theo vai trò nếu truyền `roles`). */
export async function listEffectiveMemberUserIds(
  homeId: number,
  roles?: readonly MemberRole[],
  db: Queryable = pool
): Promise<number[]> {
  const params: SqlParam[] = [homeId];
  let roleFilter = "";
  if (roles !== undefined) {
    if (roles.length === 0) return [];
    roleFilter = `AND m.member_role IN (${placeholders(roles.length)})`;
    params.push(...roles);
  }
  const rows = await queryRows<{ user_id: number }>(
    `SELECT m.user_id
       FROM smart_home_members m
      WHERE m.home_id = ? AND m.user_id IS NOT NULL AND (m.expires_at IS NULL OR m.expires_at > NOW()) ${roleFilter}
      ORDER BY m.user_id`,
    params,
    db
  );
  return rows.map((row) => row.user_id);
}

/** id mọi nhà mà user là thành viên hiệu lực. */
export async function listEffectiveHomeIds(userId: number, db: Queryable = pool): Promise<number[]> {
  const rows = await queryRows<{ home_id: number }>(
    `SELECT m.home_id
       FROM smart_home_members m
      WHERE m.user_id = ? AND (m.expires_at IS NULL OR m.expires_at > NOW())
      ORDER BY m.home_id`,
    [userId],
    db
  );
  return rows.map((row) => row.home_id);
}

/** Grant còn hiệu lực (chưa thu hồi, chưa hết hạn) của Operator trên một nhà; ưu tiên grant hết hạn muộn nhất. */
export async function findActiveGrant(operatorId: number, homeId: number, db: Queryable = pool): Promise<OperatorGrantRow | null> {
  return queryOne<OperatorGrantRow>(
    `SELECT id, operator_user_id, home_id, reason, granted_by, expires_at, created_at
       FROM operator_home_access
      WHERE operator_user_id = ? AND home_id = ? AND revoked_at IS NULL AND expires_at > NOW()
      ORDER BY expires_at DESC
      LIMIT 1`,
    [operatorId, homeId],
    db
  );
}
