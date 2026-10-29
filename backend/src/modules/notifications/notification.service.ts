// Tạo thông báo (CONTRACT_V2 §1.1, §6). Hai nhóm người nhận trong cùng bảng `notifications`:
//   - khách hàng: notifyHomeMembers / notifyUser — MỖI NGƯỜI NHẬN MỘT DÒNG (target_role='user',
//     user_id) để cờ is_read là của riêng từng người; mỗi dòng phát bus `notification` → WebSocket;
//   - nhân viên:  notifyStaff — một dòng dùng chung theo target_role ('admin'|'operator'|'all').
//
// Mọi hàm tạo KHÔNG BAO GIỜ ném lỗi (như services/notificationService.ts cũ): thông báo thất bại
// không được làm hỏng nghiệp vụ chính. Văn bản title/message là tiếng Việt cho người dùng cuối.
// `services/notificationService.ts` cũ (createNotification) vẫn dùng được song song.
import pool from "../../config/db";
import { queryOne, runSql, toBool, toIsoRequired } from "../../lib/db";
import { eventBus } from "../../lib/eventBus";
import type { MemberRole, Severity } from "../../types/domain";
import { listEffectiveMemberUserIds } from "../access/access.repository";
import type { CustomerNotification, NotificationRow, StaffNotification, StaffTargetRole } from "./notification.types";

/**
 * SELECT chuẩn cho NotificationRow (n = notifications, h = nhà). Nối `WHERE …` khi dùng, ví dụ
 * `${NOTIFICATION_SELECT_SQL} WHERE n.user_id = ? ORDER BY n.created_at DESC LIMIT ?`.
 */
export const NOTIFICATION_SELECT_SQL = `
  SELECT n.id, n.title, n.message, n.type, n.severity, n.target_role, n.user_id, n.home_id,
         h.name AS home_name, n.related_device_id, n.actor_id, n.actor_username, n.actor_role,
         n.is_read, n.created_at
    FROM notifications n
    LEFT JOIN smart_homes h ON h.id = n.home_id`;

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

// ── Khách hàng ─────────────────────────────────────────────────────────────

interface CustomerNotificationContent {
  type: string;
  title: string;
  message: string;
  severity: Severity;
  relatedDeviceId?: number | null;
}

export interface NotifyUserInput extends CustomerNotificationContent {
  userId: number;
  homeId?: number | null;
}

export interface NotifyHomeMembersInput extends CustomerNotificationContent {
  homeId: number;
  /** Chỉ gửi cho các vai trò này (mặc định mọi thành viên hiệu lực). */
  roles?: readonly MemberRole[];
  /** Không gửi cho người này (thường là người vừa thực hiện hành động). */
  excludeUserId?: number;
}

function clip(text: string, max: number): string {
  return text.length > max ? text.slice(0, max) : text;
}

function logFailure(what: string, err: unknown): void {
  // Không in nội dung thông báo; chỉ in lý do lỗi
  console.error(`[notify] ${what} failed:`, err instanceof Error ? err.message : "unknown error");
}

async function getHomeName(homeId: number | null): Promise<string | null> {
  if (homeId === null) return null;
  const row = await queryOne<{ name: string }>("SELECT name FROM smart_homes WHERE id = ?", [homeId]);
  return row?.name ?? null;
}

/** Ghi 1 dòng cho 1 người nhận rồi phát bus `notification`. Ném lỗi nếu INSERT hỏng (người gọi bắt). */
async function insertCustomerNotification(
  userId: number,
  homeId: number | null,
  homeName: string | null,
  content: CustomerNotificationContent
): Promise<CustomerNotification> {
  // created_at ghi tường minh, cắt về giây (đồng bộ với định dạng cũ) để DTO phát qua
  // WebSocket khớp từng chữ số với dòng sẽ đọc lại bằng REST.
  const createdAt = new Date(Math.floor(Date.now() / 1000) * 1000);
  const title = clip(content.title, 255);
  const result = await runSql(
    `INSERT INTO notifications (title, message, type, severity, target_role, user_id, home_id, related_device_id, created_at)
     VALUES (?, ?, ?, ?, 'user', ?, ?, ?, ?)
     RETURNING id`,
    [title, content.message, clip(content.type, 64), content.severity, userId, homeId, content.relatedDeviceId ?? null, createdAt]
  );
  const notification: CustomerNotification = {
    id: result.insertId,
    home_id: homeId,
    home_name: homeName,
    type: content.type,
    title,
    message: content.message,
    severity: content.severity,
    is_read: false,
    created_at: toIsoRequired(createdAt),
  };
  eventBus.emit("notification", { user_id: userId, home_id: homeId, notification });
  return notification;
}

/** Thông báo cho một khách. Trả thông báo đã tạo, hoặc null nếu lỗi. */
export async function notifyUser(input: NotifyUserInput): Promise<CustomerNotification | null> {
  try {
    const homeId = input.homeId ?? null;
    return await insertCustomerNotification(input.userId, homeId, await getHomeName(homeId), input);
  } catch (err) {
    logFailure("notifyUser", err);
    return null;
  }
}

/**
 * Thông báo cho mọi thành viên hiệu lực của nhà (lọc theo vai trò / loại trừ người thao tác).
 * Một dòng + một sự kiện bus cho mỗi người. Trả số người đã nhận thành công.
 */
export async function notifyHomeMembers(input: NotifyHomeMembersInput): Promise<number> {
  try {
    let userIds = await listEffectiveMemberUserIds(input.homeId, input.roles);
    if (input.excludeUserId !== undefined) userIds = userIds.filter((id) => id !== input.excludeUserId);
    if (userIds.length === 0) return 0;

    const homeName = await getHomeName(input.homeId);
    let delivered = 0;
    for (const userId of userIds) {
      try {
        await insertCustomerNotification(userId, input.homeId, homeName, input);
        delivered += 1;
      } catch (err) {
        logFailure("notifyHomeMembers (one recipient)", err);
      }
    }
    return delivered;
  } catch (err) {
    logFailure("notifyHomeMembers", err);
    return 0;
  }
}

// ── Nhân viên ──────────────────────────────────────────────────────────────

export interface NotifyStaffInput {
  /** admin | operator | all (cả hai). */
  targetRole: StaffTargetRole;
  type: string;
  title: string;
  message: string;
  severity: Severity;
  homeId?: number | null;
  relatedDeviceId?: number | null;
  /** Người gây ra sự kiện (nếu có) — hiển thị "ai đã làm" trong console. */
  actor?: { id: number; username: string; role: string } | null;
}

/** Thông báo cho nhân viên theo target_role (một dòng, cờ is_read dùng chung). Trả id dòng hoặc null. */
export async function notifyStaff(input: NotifyStaffInput): Promise<number | null> {
  try {
    const result = await runSql(
      `INSERT INTO notifications
         (title, message, type, severity, target_role, home_id, related_device_id, actor_id, actor_username, actor_role)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       RETURNING id`,
      [
        clip(input.title, 255),
        input.message,
        clip(input.type, 64),
        input.severity,
        input.targetRole,
        input.homeId ?? null,
        input.relatedDeviceId ?? null,
        input.actor?.id ?? null,
        input.actor ? clip(input.actor.username, 64) : null,
        input.actor ? clip(input.actor.role, 32) : null,
      ],
      pool
    );
    return result.insertId;
  } catch (err) {
    logFailure("notifyStaff", err);
    return null;
  }
}
