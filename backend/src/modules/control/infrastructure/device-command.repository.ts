// SQL bảng device_commands (module control là chủ duy nhất): ghi lệnh, cập nhật trạng thái.
import pool from "../../../infrastructure/database/pool";
import { runSql, type Queryable } from "../../../infrastructure/database/db";
import type { DeviceRow } from "../../devices";
import type { CommandChannel, CommandSource } from "../domain/command.types";

export async function insertCommandRow(
  device: Pick<DeviceRow, "id" | "home_id">,
  command: string,
  issuedBy: number | null,
  source: CommandSource,
  channel: CommandChannel,
  issuedAt: Date,
  db: Queryable = pool
): Promise<number> {
  const result = await runSql(
    `INSERT INTO device_commands (device_id, home_id, issued_by, source, channel, command, status, issued_at)
     VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)
     RETURNING id`,
    [device.id, device.home_id, issuedBy, source, channel, command, issuedAt],
    db
  );
  return result.insertId;
}

/** Không bao giờ ném lỗi: cập nhật trạng thái lệnh thất bại không được làm hỏng luồng điều khiển. */
export async function markCommand(
  rowId: number,
  status: "sent" | "failed" | "timeout",
  errorCode: string | null,
  db: Queryable = pool
): Promise<void> {
  try {
    await runSql("UPDATE device_commands SET status = ?, error_code = ? WHERE id = ?", [status, errorCode, rowId], db);
  } catch (err) {
    console.error("[commands] failed to update command status:", err instanceof Error ? err.message : "unknown error");
  }
}

/** Lệnh bật/tắt relay được thiết bị ack ok. */
export async function markCommandAcked(rowId: number, ackedAt: Date, db: Queryable = pool): Promise<void> {
  await runSql("UPDATE device_commands SET status = 'acked', error_code = NULL, acked_at = ? WHERE id = ?", [ackedAt, rowId], db);
}

/** Lệnh gateway (restart/factory-reset) được simulator ack ok. */
export async function markGatewayCommandAcked(rowId: number, ackedAt: Date, db: Queryable = pool): Promise<void> {
  await runSql("UPDATE device_commands SET status = 'acked', acked_at = ? WHERE id = ?", [ackedAt, rowId], db);
}
