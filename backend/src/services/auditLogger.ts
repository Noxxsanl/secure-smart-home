import type { PoolConnection } from "mysql2/promise";
import pool from "../config/db";
import { logEvent } from "../modules/logs/logEvent";

// Chữ ký `log()` giữ nguyên cho code cũ (validateDevice, mqttDataService, routes/*.ts).
// Từ V2 hàm đi qua logEvent() nên mỗi dòng audit_log có category/severity theo bảng chung
// (modules/logs/eventCatalog.ts) và home_id suy từ thiết bị. Code mới gọi logEvent() trực tiếp.
export async function log(
  event_type: string,
  device_id: number | null,
  ip: string | null,
  user_agent: string | null,
  details: Record<string, unknown> | null
): Promise<void> {
  // logEvent không bao giờ ném lỗi — audit logging must never crash the main flow
  await logEvent({
    eventType: event_type,
    deviceId: device_id,
    ip,
    userAgent: user_agent,
    details,
  });
}

// Insert DATA_RECV log then prune, keeping only the 150 newest entries per device.
// Runs in a transaction so the prune never removes more than what was just inserted.
export async function logDataRecvWithPrune(
  device_id: number,
  ip: string | null,
  user_agent: string | null,
  details: Record<string, unknown> | null
): Promise<void> {
  let conn: PoolConnection;
  try {
    conn = await pool.getConnection();
  } catch {
    return; // DB không sẵn sàng — audit logging must never crash the main flow
  }
  try {
    await conn.beginTransaction();

    // category/severity ghi tường minh: cột category mặc định là 'security' nên bỏ trống sẽ
    // làm mọi DATA_RECV bị xếp nhầm vào Security Log.
    await conn.execute(
      `INSERT INTO audit_log (event_type, category, severity, device_id, home_id, ip_address, user_agent, details)
       VALUES ('DATA_RECV', 'mqtt', 'info', ?, (SELECT home_id FROM devices WHERE id = ?), ?, ?, ?)`,
      [device_id, device_id, ip ?? null, user_agent ?? null, details ? JSON.stringify(details) : null]
    );

    // Delete DATA_RECV logs for this device beyond the 150 newest.
    // Double-subquery pattern required because MySQL forbids DELETE referencing
    // the target table directly in a subquery.
    await conn.execute(
      `DELETE FROM audit_log
       WHERE event_type = 'DATA_RECV'
         AND device_id = ?
         AND id NOT IN (
           SELECT id FROM (
             SELECT id FROM audit_log
             WHERE event_type = 'DATA_RECV' AND device_id = ?
             ORDER BY id DESC
             LIMIT 150
           ) t
         )`,
      [device_id, device_id]
    );

    await conn.commit();
  } catch {
    try { await conn.rollback(); } catch { /* ignore */ }
    // audit logging must never crash the main flow
  } finally {
    conn.release();
  }
}
