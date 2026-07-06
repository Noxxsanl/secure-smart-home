import pool from "../config/db";

export async function log(
  event_type: string,
  device_id: number | null,
  ip: string | null,
  user_agent: string | null,
  details: Record<string, unknown> | null
): Promise<void> {
  try {
    await pool.execute(
      `INSERT INTO audit_log (event_type, device_id, ip_address, user_agent, details)
       VALUES (?, ?, ?, ?, ?)`,
      [event_type, device_id ?? null, ip ?? null, user_agent ?? null, details ? JSON.stringify(details) : null]
    );
  } catch {
    // audit logging must never crash the main flow
  }
}

// Insert DATA_RECV log then prune, keeping only the 150 newest entries per device.
// Runs in a transaction so the prune never removes more than what was just inserted.
export async function logDataRecvWithPrune(
  device_id: number,
  ip: string | null,
  user_agent: string | null,
  details: Record<string, unknown> | null
): Promise<void> {
  const conn = await (pool as any).getConnection();
  try {
    await conn.beginTransaction();

    await conn.execute(
      `INSERT INTO audit_log (event_type, device_id, ip_address, user_agent, details)
       VALUES ('DATA_RECV', ?, ?, ?, ?)`,
      [device_id, ip ?? null, user_agent ?? null, details ? JSON.stringify(details) : null]
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
