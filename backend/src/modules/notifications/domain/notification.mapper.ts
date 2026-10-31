// Dòng `notifications` → DTO: khách (REST + payload bus `notification`) và nhân viên (console).
import { toBool, toIsoRequired } from "../../../infrastructure/database/db";
import type { CustomerNotification } from "../../../shared/events/event-payloads";
import type { NotificationRow, StaffNotification } from "./notification.types";

export function toCustomerNotification(row: NotificationRow): CustomerNotification {
  return {
    id: row.id,
    home_id: row.home_id,
    home_name: row.home_name ?? null,
    type: row.type,
    title: row.title,
    message: row.message,
    severity: row.severity,
    is_read: toBool(row.is_read),
    created_at: toIsoRequired(row.created_at),
  };
}

export function toStaffNotification(row: NotificationRow): StaffNotification {
  return {
    id: row.id,
    title: row.title,
    message: row.message,
    type: row.type,
    severity: row.severity,
    home_id: row.home_id,
    related_device_id: row.related_device_id,
    actor_id: row.actor_id,
    actor_username: row.actor_username,
    actor_role: row.actor_role,
    target_role: row.target_role,
    is_read: toBool(row.is_read),
    created_at: toIsoRequired(row.created_at),
  };
}
