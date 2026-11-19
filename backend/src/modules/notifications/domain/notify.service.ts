// Tạo thông báo (CONTRACT_V2 §1.1, §6). Hai nhóm người nhận trong cùng bảng `notifications`:
//   - khách hàng: notifyHomeMembers / notifyUser — MỖI NGƯỜI NHẬN MỘT DÒNG (target_role='user',
//     user_id) để cờ is_read là của riêng từng người; mỗi dòng phát bus `notification` → WebSocket;
//   - nhân viên:  notifyStaff — một dòng dùng chung theo target_role ('admin'|'operator'|'all').
//
// Mọi hàm tạo KHÔNG BAO GIỜ ném lỗi (như modules/legacy/infrastructure/legacy-notification.ts): thông báo thất bại
// không được làm hỏng nghiệp vụ chính. Văn bản title/message là tiếng Việt cho người dùng cuối.
// `modules/legacy/infrastructure/legacy-notification.ts` (createNotification) vẫn dùng được song song.
// Module khác gọi các hàm này qua notifications.facade.ts (index.ts).
import { toIsoRequired } from "../../../infrastructure/database/db";
import { eventBus } from "../../../shared/events/event-bus";
import type { CustomerNotification } from "../../../shared/events/event-payloads";
import type { MemberRole, Severity } from "../../../shared/types/domain";
import { listEffectiveMemberUserIds } from "../../homes";
import { insertCustomerNotificationRow } from "../infrastructure/customer-notifications.repository";
import { findHomeName } from "../infrastructure/notifications.read-model";
import { insertStaffNotificationRow } from "../infrastructure/staff-notifications.repository";
import type { StaffTargetRole } from "./notification.types";

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
  const id = await insertCustomerNotificationRow({
    title,
    message: content.message,
    type: clip(content.type, 64),
    severity: content.severity,
    userId,
    homeId,
    relatedDeviceId: content.relatedDeviceId ?? null,
    createdAt,
  });
  const notification: CustomerNotification = {
    id,
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
    return await insertCustomerNotification(input.userId, homeId, await findHomeName(homeId), input);
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

    const homeName = await findHomeName(input.homeId);
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
    return await insertStaffNotificationRow({
      title: clip(input.title, 255),
      message: input.message,
      type: clip(input.type, 64),
      severity: input.severity,
      targetRole: input.targetRole,
      homeId: input.homeId ?? null,
      relatedDeviceId: input.relatedDeviceId ?? null,
      actorId: input.actor?.id ?? null,
      actorUsername: input.actor ? clip(input.actor.username, 64) : null,
      actorRole: input.actor ? clip(input.actor.role, 32) : null,
    });
  } catch (err) {
    logFailure("notifyStaff", err);
    return null;
  }
}
