// DTO của Dashboard API (CONTRACT_V2 §5). Khớp frontend/packages/console/api/types.ts.
// Không có trường secret/hash nào ở đây (invariant 1, 2).
import type { HomeStatus, PackageCode, MemberRole, Severity } from "../../types/domain";
import type { ConsoleDevice, Gateway } from "../devices/devices.types";
import type { Home, RoomSummary } from "../homes/homes.types";
import type { ActivationCodeIssued } from "../homes/homes.types";
import type { LogCategory } from "../logs/eventCatalog";

export type { ConsoleDevice, Gateway, ActivationCodeIssued };

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

export interface Customer {
  id: number;
  user_id: number;
  name: string;
  user_tag: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  joined_at: string;
  status: "active" | "inactive";
  homes_count: number;
  last_login: string | null;
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

export interface LogEntry {
  id: number;
  category: LogCategory;
  severity: Severity;
  event_type: string;
  timestamp: string;
  home_id: number | null;
  home_name: string | null;
  gateway_uid: string | null;
  device_uid: string | null;
  actor_username: string | null;
  ip_address: string | null;
  message: string;
  details: Record<string, unknown> | null;
}

export interface AutomationRuleDto {
  id: number;
  home_id: number;
  home_name: string;
  name: string;
  enabled: boolean;
  trigger_type: "sensor_threshold" | "schedule";
  trigger_room_id: number | null;
  trigger_room_name: string | null;
  trigger_metric: "temperature" | "humidity" | null;
  trigger_operator: ">" | "<" | "=" | null;
  trigger_threshold: number | null;
  schedule_time: string | null;
  schedule_days: number[] | null;
  action_device_id: number | null;
  action_device_name: string | null;
  action_command: "turn_on" | "turn_off";
  origin: "user" | "ai_suggested";
  created_by_user_id: number | null;
  created_by_name: string | null;
  last_triggered_at: string | null;
  created_at: string;
  can_edit: boolean;
  can_delete: boolean;
}

export interface FirmwareVersion {
  id: number;
  type: "gateway" | "node";
  version: string;
  stable: boolean;
  released_at: string;
  file_name: string;
  size_kb: number;
  checksum_sha256: string;
  release_notes: string | null;
  uploaded_by_username: string | null;
}

export interface OtaDeployment {
  id: number;
  firmware_id: number;
  firmware_version: string;
  firmware_type: "gateway" | "node";
  scope: "fleet" | "home";
  target_home_id: number | null;
  target_home_name: string | null;
  progress_percent: number;
  target_count: number;
  applied_count: number;
  failed_count: number;
  status: "in_progress" | "completed" | "rolled_back" | "failed";
  started_at: string;
  created_by_username: string | null;
}

export interface StaffAccount {
  id: number;
  username: string;
  role: "admin" | "operator";
  status: "active" | "locked";
  created_at: string;
  last_login: string | null;
}
