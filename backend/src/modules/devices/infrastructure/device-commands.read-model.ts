// Read model lệnh gần đây của một thiết bị cho console: JOIN device_commands (module control) với users/customers
// (module identity) để lấy tên người ra lệnh — truy vấn chỉ-đọc nên đặt ở read model (quy tắc T2).
import { queryRows, sqlLimit, toIso, toIsoRequired } from "../../../infrastructure/database/db";

export interface CommandRecordRow {
  id: number;
  command: string;
  status: "pending" | "sent" | "acked" | "failed" | "timeout";
  source: "user" | "automation" | "operator";
  channel: "mobile" | "web" | "dashboard" | "system";
  issued_by_name: string | null;
  issued_at: Date;
  acked_at: Date | null;
}

export async function listRecentCommands(deviceId: number, limit: number) {
  const rows = await queryRows<CommandRecordRow>(
    `SELECT c.id, c.command, c.status, c.source, c.channel, COALESCE(cc.full_name, u.username, u.email) AS issued_by_name,
            c.issued_at, c.acked_at
       FROM device_commands c
       LEFT JOIN users u ON u.id = c.issued_by
       LEFT JOIN customers cc ON cc.user_id = c.issued_by
      WHERE c.device_id = ?
      ORDER BY c.id DESC LIMIT ?`,
    [deviceId, sqlLimit(limit)]
  );
  return rows.map((row) => ({
    id: row.id,
    command: row.command,
    status: row.status,
    source: row.source,
    channel: row.channel,
    issued_by_name: row.issued_by_name,
    issued_at: toIsoRequired(row.issued_at),
    acked_at: toIso(row.acked_at),
  }));
}
