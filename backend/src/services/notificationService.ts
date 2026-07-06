import pool from "../config/db";

interface CreateNotificationParams {
  title: string;
  message: string;
  type: string;
  actor_id: number;
  actor_username: string;
  actor_role: string;
  // target_role xác định role nào trong admin panel sẽ thấy thông báo này.
  // Hiện tại GET /api/notifications chỉ hỗ trợ "admin".
  target_role?: string;
  related_device_id?: number | null;
}

export async function createNotification(params: CreateNotificationParams): Promise<void> {
  const {
    title, message, type,
    actor_id, actor_username, actor_role,
    target_role = "admin",
    related_device_id = null,
  } = params;
  try {
    await pool.execute(
      `INSERT INTO notifications
         (title, message, type, actor_id, actor_username, actor_role, target_role, related_device_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [title, message, type, actor_id, actor_username, actor_role, target_role, related_device_id ?? null]
    );
  } catch {
    // notification creation must never crash the main flow
  }
}
