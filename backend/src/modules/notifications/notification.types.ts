// Kiểu dữ liệu thông báo (CONTRACT_V2 §1.1, §3, §5).
// `notifications` dùng chung cho 2 đối tượng:
//   - nhân viên (ADMIN/OPERATOR): target_role = 'admin' | 'operator' | 'all', cờ is_read dùng chung;
//   - khách hàng: target_role = 'user', user_id = người nhận (mỗi người một dòng).
import type { Severity } from "../../types/domain";

/** target_role dành cho nhân viên. */
export type StaffTargetRole = "admin" | "operator" | "all";

export interface CustomerNotification {
  id: number;
  home_id: number | null;
  home_name: string | null;
  type: string;
  title: string;
  message: string;
  severity: Severity;
  is_read: boolean;
  created_at: string;
}

export interface StaffNotification {
  id: number;
  title: string;
  message: string;
  type: string;
  severity: Severity;
  home_id: number | null;
  related_device_id: number | null;
  actor_id: number | null;
  actor_username: string | null;
  actor_role: string | null;
  target_role: string;
  is_read: boolean;
  created_at: string;
}

/** Dòng `notifications` (có thể join tên nhà qua cột home_name). */
export interface NotificationRow {
  id: number;
  title: string;
  message: string;
  type: string;
  severity: Severity;
  target_role: string;
  user_id: number | null;
  home_id: number | null;
  home_name?: string | null;
  related_device_id: number | null;
  actor_id: number | null;
  actor_username: string | null;
  actor_role: string | null;
  is_read: boolean;
  created_at: Date;
}
