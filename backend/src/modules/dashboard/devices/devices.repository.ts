// SQL thiết bị cho console (danh sách lọc, lệnh gần đây, đổi trạng thái/gán nhà, xoá). Không bao giờ
// SELECT secret_key — dùng DEVICE_SELECT_SQL của read model.
import pool from "../../../config/db";
import { queryOne, queryRows, runSql, sqlLimit, toIso, toIsoRequired, type Queryable, type SqlParam } from "../../../lib/db";
import type { DeviceCategory, DeviceStatus } from "../../../types/domain";
import { DEVICE_SELECT_SQL } from "../../devices/deviceReadModel";
import type { DeviceRow } from "../../devices/devices.types";
import { likePattern } from "../common/staff";

export interface DeviceListFilter {
  homeId?: number;
  category?: DeviceCategory;
  status?: DeviceStatus;
  q?: string;
  includeGateways: boolean;
}

export async function listDevices(filter: DeviceListFilter): Promise<DeviceRow[]> {
  const clauses: string[] = [];
  const params: SqlParam[] = [];
  // Gateway có trang riêng (/gateways) nên mặc định loại khỏi danh sách thiết bị
  if (!filter.includeGateways) clauses.push("d.device_type <> 'gateway'");
  if (filter.homeId !== undefined) {
    clauses.push("d.home_id = ?");
    params.push(filter.homeId);
  }
  if (filter.category !== undefined) {
    clauses.push("d.category = ?");
    params.push(filter.category);
  }
  if (filter.status !== undefined) {
    clauses.push("d.status = ?");
    params.push(filter.status);
  }
  if (filter.q !== undefined) {
    const pattern = likePattern(filter.q);
    clauses.push("(d.device_name LIKE ? OR d.device_id LIKE ? OR h.name LIKE ?)");
    params.push(pattern, pattern, pattern);
  }
  const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
  return queryRows<DeviceRow>(`${DEVICE_SELECT_SQL} ${where} ORDER BY d.id DESC LIMIT ?`, [...params, sqlLimit(2000)]);
}

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

/** Đổi trạng thái quản trị; 'active' reset fail_count (mở khoá thiết bị bị chặn do sai HMAC). */
export async function updateDeviceStatus(id: number, status: DeviceStatus): Promise<void> {
  if (status === "active") {
    await runSql("UPDATE devices SET status = ?, fail_count = 0 WHERE id = ?", [status, id]);
  } else {
    await runSql("UPDATE devices SET status = ? WHERE id = ?", [status, id]);
  }
}

export interface DevicePatch {
  deviceName?: string;
  /** undefined = giữ nguyên; null = bỏ gán. */
  homeId?: number | null;
  roomId?: number | null;
  gatewayDeviceId?: number | null;
}

/** UPDATE đúng các cột có trong patch (tên cột cố định). */
export async function updateDeviceFields(id: number, patch: DevicePatch): Promise<void> {
  const sets: string[] = [];
  const params: SqlParam[] = [];
  if (patch.deviceName !== undefined) {
    sets.push("device_name = ?");
    params.push(patch.deviceName);
  }
  if (patch.homeId !== undefined) {
    sets.push("home_id = ?");
    params.push(patch.homeId);
  }
  if (patch.roomId !== undefined) {
    sets.push("room_id = ?");
    params.push(patch.roomId);
  }
  if (patch.gatewayDeviceId !== undefined) {
    sets.push("gateway_device_id = ?");
    params.push(patch.gatewayDeviceId);
  }
  if (sets.length === 0) return;
  await runSql(`UPDATE devices SET ${sets.join(", ")} WHERE id = ?`, [...params, id]);
}

/** Gateway (devices.id) đầu tiên của nhà, nếu có. */
export async function findHomeGatewayId(homeId: number, db: Queryable = pool): Promise<number | null> {
  const row = await queryOne<{ id: number }>(
    "SELECT id FROM devices WHERE home_id = ? AND device_type = 'gateway' ORDER BY id LIMIT 1",
    [homeId],
    db
  );
  return row?.id ?? null;
}

/** FK ON DELETE CASCADE dọn sensor_data, device_tokens, ota_history, device_commands… */
export async function deleteDeviceRow(id: number): Promise<void> {
  await runSql("DELETE FROM devices WHERE id = ?", [id]);
}
