// GET /homes/:homeId/members — thành viên + lời mời đang chờ (FR-6.2). Mọi thành viên xem được danh sách;
// lời mời đang chờ và email chỉ OWNER thấy.
import type { AuthContext } from "../../../../core/auth/auth-context";
import { requireHomeMember } from "../../domain/access-policy";
import { buildMembers } from "../../domain/member-view";
import type { PortalMember } from "../../domain/member.types";
import { listHomeMembers } from "../../infrastructure/members.read-model";

export async function listMembers(auth: AuthContext, homeId: number): Promise<PortalMember[]> {
  const access = await requireHomeMember(auth, homeId, "view");
  const isOwner = access.role === "OWNER";
  const rows = await listHomeMembers(homeId);
  // Lời mời đang chờ chỉ OWNER thấy
  const visible = isOwner ? rows : rows.filter((row) => row.user_id !== null);
  return buildMembers(auth, visible, isOwner);
}
