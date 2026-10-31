// Kiểu dữ liệu của lớp phân quyền theo nhà (RBAC tầng 2 — CONTRACT_V2 §4.1, §5 Operator scoping).
import type { MemberRole } from "../../../shared/types/domain";
import type { HomeRow } from "./home.types";

/**
 * Hành động trong nhà. Ma trận quyền theo vai trò nằm ở permissions.ts (CONTRACT §4.1):
 *   view              xem nhà/phòng/thiết bị/telemetry/thông báo/thành viên
 *   control_device    điều khiển relay (GUEST: chỉ thiết bị được phép)
 *   rename            đổi tên nhà/phòng/thiết bị
 *   view_automation   xem automation + gợi ý (GUEST: 403)
 *   create_automation tạo rule, chấp nhận/bỏ qua gợi ý
 *   manage_any_rule   sửa/bật-tắt/xoá rule của người khác (OWNER); CONTROLLER chỉ rule của mình — canEditRule()
 *   manage_members    mời / đổi vai trò / xoá thành viên
 *   leave             rời nhà (OWNER không được: OWNER_CANNOT_LEAVE)
 */
export type Permission =
  | "view"
  | "control_device"
  | "rename"
  | "view_automation"
  | "create_automation"
  | "manage_any_rule"
  | "manage_members"
  | "leave";

/** Một dòng smart_home_members. */
export interface MemberRow {
  id: number;
  home_id: number;
  user_id: number | null;
  member_role: MemberRole;
  display_name: string | null;
  invite_email: string | null;
  invite_expires_at: Date | null;
  invited_by: number | null;
  expires_at: Date | null;
  accepted_at: Date | null;
  created_at: Date;
}

/** Kết quả requireHomeMember — người gọi đã là thành viên hiệu lực của nhà. */
export interface HomeAccess {
  home: HomeRow;
  member: MemberRow;
  role: MemberRole;
  permissions: readonly Permission[];
  /** GUEST: id thiết bị được phép (đã lọc theo nhà); vai trò khác: null = mọi thiết bị. */
  guestDeviceIds: number[] | null;
}

/** Một dòng operator_home_access đang hiệu lực. */
export interface OperatorGrantRow {
  id: number;
  operator_user_id: number;
  home_id: number;
  reason: string;
  granted_by: number;
  expires_at: Date;
  created_at: Date;
}

export interface OperatorAccess {
  /** true = Operator, nhà đã claim, chưa có grant → chỉ được xem dữ liệu "fleet", không xem dữ liệu khách. */
  restricted: boolean;
  /** Grant đang hiệu lực (chỉ có khi Operator xem nhà đã claim bằng grant). */
  grant: OperatorGrantRow | null;
}
