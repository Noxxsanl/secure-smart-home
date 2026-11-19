// Cửa ra DUY NHẤT của module homes: module khác chỉ được import từ đây (quy tắc phụ thuộc, modules/README.md).
// Giá trị re-export từ homes.facade.ts; kiểu công khai khai báo bên dưới. Không dùng `export *`.
export { homesModule } from "./homes.module";
export {
  assertHomeWritable,
  assignOwner,
  auditOperatorHomeViewed,
  canControlDevice,
  canEditRule,
  canSeeCustomerData,
  canViewDevice,
  createKitHome,
  generateActivationCode,
  getEffectiveMemberAccess,
  getHomeRow,
  getHomeSummary,
  getRoomRow,
  hashActivationCode,
  listEffectiveHomeIds,
  listEffectiveMemberUserIds,
  listGrants,
  listHomeRows,
  listRoomSummaries,
  loadStaffScope,
  normalizeActivationCode,
  requireHomeMember,
  requireOperatorHomeAccess,
  requireRoomAccess,
  toHome,
} from "./homes.facade";
export type { HomeAccess, Permission } from "./domain/access.types";
export type { ActivationRecord, OperatorAccessGrant, SmartHomeRow, Warranty } from "./domain/console-home.types";
export type { Home, KitHomeResult, RoomSummary } from "./domain/home.types";
