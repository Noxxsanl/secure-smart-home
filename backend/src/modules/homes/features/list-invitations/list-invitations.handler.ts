// GET /invitations — lời mời đang chờ gửi tới email của tôi (FR-6.6).
import type { AuthContext } from "../../../../core/auth/auth-context";
import { toIso } from "../../../../infrastructure/database/db";
import type { InvitationView } from "../../domain/member.types";
import { listInvitationsForEmail } from "../../infrastructure/members.read-model";

export async function listMyInvitations(auth: AuthContext): Promise<InvitationView[]> {
  if (auth.email === null) return [];
  const rows = await listInvitationsForEmail(auth.email.toLowerCase());
  return rows.map((row) => ({
    id: row.id,
    home: { id: row.home_id, name: row.home_name, address: row.home_address },
    role: row.member_role,
    invited_by_name: row.invited_by_name,
    invite_expires_at: toIso(row.invite_expires_at) ?? "",
    expires_at: toIso(row.expires_at),
  }));
}
