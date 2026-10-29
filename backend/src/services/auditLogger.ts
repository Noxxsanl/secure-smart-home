import { runSql, withTransaction } from "../lib/db";
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
  try {
    await withTransaction(async (conn) => {
      // category/severity ghi tường minh: cột category mặc định là 'security' nên bỏ trống sẽ
      // làm mọi DATA_RECV bị xếp nhầm vào Security Log.
      await runSql(
        `INSERT INTO audit_log (event_type, category, severity, device_id, home_id, ip_address, user_agent, details)
         VALUES ('DATA_RECV', 'mqtt', 'info', ?, (SELECT home_id FROM devices WHERE id = ?), ?, ?, ?)`,
        [device_id, device_id, ip ?? null, user_agent ?? null, details ? JSON.stringify(details) : null],
        conn
      );

      // Delete DATA_RECV logs for this device beyond the 150 newest.
      // PostgreSQL cho phép subquery tham chiếu chính bảng đang DELETE nên không cần bọc 2 lớp như MySQL.
      await runSql(
        `DELETE FROM audit_log
         WHERE event_type = 'DATA_RECV'
           AND device_id = ?
           AND id NOT IN (
             SELECT id FROM audit_log
             WHERE event_type = 'DATA_RECV' AND device_id = ?
             ORDER BY id DESC
             LIMIT 150
           )`,
        [device_id, device_id],
        conn
      );
    });
  } catch {
    // DB không sẵn sàng / lỗi ghi — audit logging must never crash the main flow
  }
}
