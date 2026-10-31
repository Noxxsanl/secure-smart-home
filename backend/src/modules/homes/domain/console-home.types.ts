// DTO Dashboard của module homes (CONTRACT_V2 §5). Khớp frontend/packages/console/api/types.ts.
// Không có trường secret/hash nào ở đây (invariant 1, 2).
import type { HomeStatus, PackageCode, MemberRole } from "../../../shared/types/domain";
import type { Home, RoomSummary } from "./home.types";

export interface SmartHomeRow {
  id: number;
  name: string;
  address: string | null;
  package: PackageCode;
  status: HomeStatus;
  owner_customer_id: number | null;
  owner_name: string | null;
  gateway_id: number | null;
  gateway_uid: string | null;
  gateway_online: boolean | null;
  room_count: number;
  device_count: number;
  created_at: string;
  activated_at: string | null;
}

export interface HomeListFilter {
  status?: HomeStatus;
  q?: string;
  /** Nhà mà user này là thành viên hiệu lực (chi tiết khách hàng). */
  memberUserId?: number;
  limit?: number;
}

export interface HomePatch {
  name?: string;
  address?: string | null;
  status?: "active" | "suspended";
}

export interface SmartHomeDetailHome extends Home {
  owner_name: string | null;
  expected_owner_name: string | null;
  created_by_username: string | null;
}

export type ConsoleRoom = RoomSummary;

export interface ConsoleMember {
  id: number;
  home_id: number;
  user_id: number | null;
  name: string;
  initials: string;
  email: string | null;
  role: MemberRole;
  pending: boolean;
  invite_expires_at: string | null;
  expires_at: string | null;
  joined_at: string | null;
}

export interface TimelineEvent {
  id: number;
  timestamp: string;
  event_type: string;
  label: string;
  description: string | null;
}

export type ActivationStatus = "unused" | "used" | "revoked" | "expired" | "none";

export interface HomeActivationInfo {
  status: ActivationStatus;
  expires_at: string | null;
  used_at: string | null;
  created_at: string | null;
}

export interface Warranty {
  id: number;
  home_id: number;
  home_name: string;
  package: PackageCode;
  starts_at: string;
  expires_at: string;
}

export interface ActivationRecord {
  id: number;
  customer_id: number | null;
  customer_name: string | null;
  home_id: number | null;
  home_name: string | null;
  activated_at: string;
  result: "success" | "failed";
  method: "qr" | "code" | "operator_assign";
  reason: string | null;
}

export interface OperatorAccessGrant {
  id: number;
  operator_id: number;
  operator_username: string;
  home_id: number;
  home_name: string;
  reason: string;
  granted_by: number;
  granted_by_username: string | null;
  granted_at: string;
  expires_at: string;
  revoked_at: string | null;
  active: boolean;
}

