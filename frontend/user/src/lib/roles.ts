import type { AssignableRole, MemberRole } from "@/lib/api/types";

export const MEMBER_ROLE_LABELS: Record<MemberRole, string> = {
  OWNER: "Chủ nhà",
  CONTROLLER: "Điều khiển",
  VIEWER: "Chỉ xem",
  GUEST: "Khách",
};

export const ASSIGNABLE_ROLES: AssignableRole[] = ["CONTROLLER", "VIEWER", "GUEST"];

// PRD §3.2 — để khách hiểu mỗi vai trò làm được gì trước khi mời.
export const ROLE_HINTS: Record<MemberRole, string> = {
  OWNER: "Toàn quyền: điều khiển, tự động hoá, quản lý thành viên.",
  CONTROLLER: "Điều khiển thiết bị, đổi tên, tạo quy tắc tự động hoá.",
  VIEWER: "Chỉ xem trạng thái thiết bị, cảm biến và quy tắc.",
  GUEST: "Truy cập có thời hạn, chỉ các thiết bị được chỉ định.",
};

// Ma trận quyền trong nhà (CONTRACT §4.1). Backend mới là nơi kiểm tra thật —
// client chỉ dùng để ẩn/khoá nút. Quyền điều khiển từng thiết bị lấy từ
// `device.can_control` (GUEST chỉ thiết bị được chỉ định); quyền sửa/xoá từng
// quy tắc lấy từ `rule.can_edit` / `rule.can_delete`.
export type HomePermissions = {
  isOwner: boolean;
  /** Đổi tên nhà / phòng / thiết bị. */
  canRename: boolean;
  /** Xem quy tắc tự động hoá + gợi ý (GUEST bị 403). */
  canViewAutomation: boolean;
  /** Tạo quy tắc, chấp nhận / bỏ qua gợi ý. */
  canManageAutomation: boolean;
  /** Mời, đổi vai trò, xoá thành viên. */
  canManageMembers: boolean;
  /** Tự rời khỏi nhà. */
  canLeave: boolean;
  /** Vai trò có thể điều khiển ít nhất một thiết bị (VIEWER thì không). */
  mayControl: boolean;
};

export function permissionsFor(role: MemberRole): HomePermissions {
  const isOwner = role === "OWNER";
  const isManager = isOwner || role === "CONTROLLER";
  return {
    isOwner,
    canRename: isManager,
    canViewAutomation: role !== "GUEST",
    canManageAutomation: isManager,
    canManageMembers: isOwner,
    canLeave: !isOwner,
    mayControl: role !== "VIEWER",
  };
}
