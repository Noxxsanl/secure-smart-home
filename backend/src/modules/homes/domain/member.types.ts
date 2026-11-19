// Kiểu dữ liệu thành viên & lời mời phía khách (CONTRACT §4.2 Members & invitations).
import type { MemberRole } from "../../../shared/types/domain";

/** Vai trò được phép mời/đổi sang (OWNER chỉ có khi claim/gán chủ nhà). */
export const INVITE_ROLES = ["CONTROLLER", "VIEWER", "GUEST"] as const;

export const ROLE_LABEL: Record<MemberRole, string> = {
  OWNER: "Chủ nhà",
  CONTROLLER: "Người điều khiển",
  VIEWER: "Người xem",
  GUEST: "Khách",
};

/** Một dòng smart_home_members kèm tên/email lấy từ users + customers (read model). */
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

export interface PortalMember {
  id: number;
  home_id: number;
  user_id: number | null;
  name: string;
  initials: string;
  email: string | null;
  role: MemberRole;
  is_me: boolean;
  pending: boolean;
  invite_expires_at: string | null;
  expires_at: string | null;
  guest_device_ids: number[];
  joined_at: string | null;
}

export interface InvitationView {
  id: number;
  home: { id: number; name: string; address: string | null };
  role: MemberRole;
  invited_by_name: string | null;
  invite_expires_at: string;
  expires_at: string | null;
}
