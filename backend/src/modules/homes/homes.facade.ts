// Hàm của module homes mà module khác được gọi (index.ts re-export từ đây). Chỉ re-export từ domain/ và
// infrastructure/ — không chứa logic. Thêm export mới được; đổi tên/xoá export phải báo module đang dùng.

// Phân quyền theo nhà (RBAC tầng 2, invariant 6) + quyền của Operator (FR-9.6)
export {
  auditOperatorHomeViewed,
  getEffectiveMemberAccess,
  requireHomeMember,
  requireOperatorHomeAccess,
} from "./domain/access-policy";
export { requireRoomAccess } from "./domain/room-access";
export { assertHomeWritable, canControlDevice, canEditRule, canViewDevice } from "./domain/permissions";
export { canSeeCustomerData, loadStaffScope } from "./domain/staff-scope";
export { listEffectiveHomeIds, listEffectiveMemberUserIds } from "./infrastructure/access.repository";

// KIT + mã kích hoạt + gán chủ nhà (gọi trong transaction của người gọi — seed, claim, dashboard)
export { assignOwner } from "./domain/activation";
export { createKitHome } from "./domain/provisioning";
export { generateActivationCode, hashActivationCode, normalizeActivationCode } from "./domain/activation-code";

// Đọc nhà / phòng / grant (read model)
export { toHome } from "./domain/home.mapper";
export { getHomeRow } from "./infrastructure/home.read-model";
export { getRoomRow } from "./infrastructure/homes.repository";
export { listRoomSummaries } from "./infrastructure/room.read-model";
export { listGrants } from "./infrastructure/operator-access.read-model";
export { getHomeSummary, listHomeRows } from "./infrastructure/smart-homes.read-model";
