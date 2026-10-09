// Phân quyền theo nhà (RBAC tầng 2, invariant 6) và quyền truy cập của Operator (FR-9.6).
//
// Quy tắc 404/403 (CONTRACT §0, §4.1):
//   - nhà không tồn tại / không phải thành viên / GUEST hết hạn → 404 NOT_FOUND (không lộ sự tồn tại)
//   - là thành viên nhưng vai trò thiếu quyền                    → 403 FORBIDDEN
//   - nhà suspended: đọc được, ghi/điều khiển → assertHomeWritable() (409 HOME_SUSPENDED)
import { HttpError, forbidden, notFound } from "../../lib/http";
import type { RequestMeta } from "../../lib/clientIp";
import type { MemberRole } from "../../types/domain";
import type { AuthContext } from "../auth/auth.types";
import { getHomeRow } from "../homes/homes.repository";
import type { HomeRow } from "../homes/homes.types";
import { logEvent } from "../logs/logEvent";
import type { HomeAccess, OperatorAccess, OperatorGrantRow, Permission } from "./access.types";
import {
  findActiveGrant,
  findEffectiveMember,
  listEffectiveHomeIds,
  listEffectiveMemberUserIds,
  listGuestDeviceIds,
} from "./access.repository";
import { ROLE_PERMISSIONS, hasPermission } from "./permissions";

// Re-export để module khác chỉ cần import từ access.service
export { listEffectiveHomeIds, listEffectiveMemberUserIds };

/**
 * Bắt buộc `auth` là thành viên hiệu lực của nhà `homeId` và (nếu truyền) có quyền `permission`.
 * Trả { home, member, role, permissions, guestDeviceIds }. Dùng ở mọi endpoint /homes/:homeId/**.
 */
export async function requireHomeMember(auth: AuthContext, homeId: number, permission?: Permission): Promise<HomeAccess> {
  const member = await findEffectiveMember(homeId, auth.userId);
  if (!member) throw notFound("Home not found");
  const home = await getHomeRow(homeId);
  if (!home) throw notFound("Home not found");

  const role: MemberRole = member.member_role;
  const access: HomeAccess = {
    home,
    member,
    role,
    permissions: ROLE_PERMISSIONS[role],
    guestDeviceIds: role === "GUEST" ? await listGuestDeviceIds(member.id, homeId) : null,
  };
  if (permission !== undefined && !hasPermission(access, permission)) {
    throw forbidden(`Missing permission: ${permission}`);
  }
  return access;
}

/**
 * Như requireHomeMember nhưng KHÔNG ném lỗi: trả null nếu không phải thành viên hiệu lực. Dùng ở nơi
 * không có request (WebSocket hub lọc sự kiện theo từng user, job nền).
 */
export async function getEffectiveMemberAccess(
  userId: number,
  homeId: number
): Promise<{ role: MemberRole; guestDeviceIds: number[] | null } | null> {
  const member = await findEffectiveMember(homeId, userId);
  if (!member) return null;
  return {
    role: member.member_role,
    guestDeviceIds: member.member_role === "GUEST" ? await listGuestDeviceIds(member.id, homeId) : null,
  };
}

// ── Operator (FR-9.6) ──────────────────────────────────────────────────────

/** Grant còn hiệu lực của Operator trên nhà (null nếu không có). */
export async function getActiveGrant(operatorId: number, homeId: number): Promise<OperatorGrantRow | null> {
  return findActiveGrant(operatorId, homeId);
}

/**
 * Operator có bị hạn chế với nhà này không (KHÔNG ném lỗi) — dùng để dựng `access` trong
 * GET /smart-homes/:id. ADMIN không bao giờ bị hạn chế; OPERATOR không bị hạn chế với nhà CHƯA claim;
 * nhà đã claim (active/suspended) cần grant còn hạn. Vai trò khác (USER) → 403.
 */
export async function resolveOperatorAccess(auth: AuthContext, home: Pick<HomeRow, "id" | "status">): Promise<OperatorAccess> {
  if (auth.role === "admin") return { restricted: false, grant: null };
  if (auth.role !== "operator") throw forbidden("Staff role required");
  if (home.status === "unclaimed") return { restricted: false, grant: null };
  const grant = await findActiveGrant(auth.userId, home.id);
  return { restricted: grant === null, grant };
}

/**
 * Như resolveOperatorAccess nhưng ném 403 ACCESS_GRANT_REQUIRED khi bị hạn chế. Dùng cho endpoint
 * trả dữ liệu khách (thành viên, telemetry, automation…) và thao tác nhạy cảm (factory-reset).
 */
export async function requireOperatorHomeAccess(auth: AuthContext, home: Pick<HomeRow, "id" | "status">): Promise<OperatorAccess> {
  const access = await resolveOperatorAccess(auth, home);
  if (access.restricted) {
    throw new HttpError(403, "ACCESS_GRANT_REQUIRED", "An active operator access grant is required for this home");
  }
  return access;
}

// Chống ngập log: SWR trên console poll mỗi 5–10 s, ghi mỗi lượt sẽ làm nhật ký vô dụng.
// Mỗi (operator, nhà, loại dữ liệu) chỉ ghi 1 dòng / 5 phút.
const VIEW_AUDIT_WINDOW_MS = 5 * 60 * 1000;
const lastViewAudit = new Map<string, number>();

/**
 * Ghi OPERATOR_HOME_VIEWED (category activity) khi Operator xem dữ liệu khách của nhà đã claim
 * bằng grant. ADMIN, nhà chưa claim (grant null) hoặc người gọi không phải Operator → không ghi.
 * @param view mô tả tiếng Việt của dữ liệu đã xem, vd "thành viên", "thiết bị", "tự động hoá".
 */
export async function auditOperatorHomeViewed(
  auth: AuthContext,
  home: Pick<HomeRow, "id" | "name">,
  grant: OperatorGrantRow | null,
  view: string,
  meta: Partial<RequestMeta> = {}
): Promise<void> {
  if (auth.role !== "operator" || grant === null) return;

  const key = `${auth.userId}:${home.id}:${view}`;
  const now = Date.now();
  const last = lastViewAudit.get(key);
  if (last !== undefined && now - last < VIEW_AUDIT_WINDOW_MS) return;
  lastViewAudit.set(key, now);
  if (lastViewAudit.size > 2000) {
    for (const [staleKey, at] of lastViewAudit) {
      if (now - at >= VIEW_AUDIT_WINDOW_MS) lastViewAudit.delete(staleKey);
    }
  }

  await logEvent({
    eventType: "OPERATOR_HOME_VIEWED",
    homeId: home.id,
    actorUserId: auth.userId,
    message: `Operator ${auth.username} xem ${view} của nhà "${home.name}"`,
    ip: meta.ip ?? null,
    userAgent: meta.userAgent ?? null,
    details: { view, grant_id: grant.id },
  });
}
