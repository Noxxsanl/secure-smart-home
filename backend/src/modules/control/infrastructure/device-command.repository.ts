// SQL bảng device_commands (module control là chủ duy nhất): ghi lệnh, cập nhật trạng thái.
import pool from "../../../infrastructure/database/pool";
import { queryRows, runSql, type Queryable } from "../../../infrastructure/database/db";
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

/** Lệnh gần đây của một thiết bị mà telemetry có thể đang phản ánh (đường 2 của nhật ký hành vi). */
export interface RecentCommand {
  id: number;
  command: string;
  issued_by: number | null;
  source: CommandSource;
  channel: CommandChannel;
}

/** Cửa sổ gán nguồn (ms) quanh thời điểm `at` telemetry thấy trạng thái đổi — xem listRecentUnloggedCommands. */
const ATTRIBUTION_LOOKAHEAD_MS = 2_000; // lệch đồng hồ giữa ghi device_commands và nhận telemetry
const ATTRIBUTION_ACKED_LOOKBACK_MS = 3_000; // lệnh đã ack: ack phải sát lúc thấy thay đổi
const ATTRIBUTION_ISSUED_LOOKBACK_MS = 20_000; // lệnh timeout (ack mất) / pending-sent: phát ra trong 20 s trước

/**
 * Các lệnh có thể là NGUYÊN NHÂN của thay đổi trạng thái mà telemetry thấy lúc `at` (đường 2 của nhật ký hành vi), mới nhất
 * trước. Cửa sổ HẸP để lệnh no-op cũ (vd web "bật" khi đèn đã bật) không "nuốt" lần bấm tại chỗ sau đó. Chỉ xét lệnh có
 * issued_at ≤ at + 2 s và thuộc một trong các dạng:
 *   - pending/sent — còn đang chờ ack (telemetry về trước ack);
 *   - acked mà acked_at ≥ at − 3 s — ack sát lúc thấy thay đổi;
 *   - timeout mà issued_at ≥ at − 20 s — thiết bị có thể đã chạy dù ack mất.
 * pending/sent cũng giới hạn issued_at ≥ at − 20 s: ack chờ tối đa 5 s (learn_* 15 s, đã loại) nên lệnh pending/sent quá 20 s
 * là dòng mồ côi (tiến trình chết giữa chừng), không được gán cho thay đổi mới. Lệnh failed (thiết bị báo lỗi, không đổi
 * trạng thái), lệnh học mã và lệnh ĐÃ có dòng hành vi (đã giải thích một lần đổi) bị loại. Bảng device_commands và
 * user_behavior_logs đều của module control.
 */
export async function listRecentUnloggedCommands(deviceId: number, at: Date, db: Queryable = pool): Promise<RecentCommand[]> {
  const latestIssued = new Date(at.getTime() + ATTRIBUTION_LOOKAHEAD_MS);
  const ackedSince = new Date(at.getTime() - ATTRIBUTION_ACKED_LOOKBACK_MS);
  const issuedSince = new Date(at.getTime() - ATTRIBUTION_ISSUED_LOOKBACK_MS);
  return queryRows<RecentCommand>(
    `SELECT c.id, c.command, c.issued_by, c.source, c.channel
       FROM device_commands c
      WHERE c.device_id = ? AND c.issued_at <= ?
        AND (   (c.status IN ('pending', 'sent') AND c.issued_at >= ?)
             OR (c.status = 'acked' AND c.acked_at >= ?)
             OR (c.status = 'timeout' AND c.issued_at >= ?))
        AND c.command NOT LIKE 'learn%'
        AND NOT EXISTS (SELECT 1 FROM user_behavior_logs l WHERE l.device_command_id = c.id)
      ORDER BY c.issued_at DESC, c.id DESC
      LIMIT 5`,
    [deviceId, latestIssued, issuedSince, ackedSince, issuedSince],
    db
  );
}

/** Lệnh gateway (restart/factory-reset) được simulator ack ok. */
export async function markGatewayCommandAcked(rowId: number, ackedAt: Date, db: Queryable = pool): Promise<void> {
  await runSql("UPDATE device_commands SET status = 'acked', acked_at = ? WHERE id = ?", [ackedAt, rowId], db);
}
