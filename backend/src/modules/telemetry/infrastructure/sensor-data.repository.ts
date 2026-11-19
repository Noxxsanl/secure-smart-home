// SQL bảng sensor_data (module telemetry là chủ duy nhất): ghi số đo, đọc received_at, dọn theo lô.
import pool from "../../../infrastructure/database/pool";
import { queryOne, runSql, type Queryable } from "../../../infrastructure/database/db";

/** Ghi một số đo (payload đã stringify và đã kiểm không chứa NUL) → sensor_data.id. */
export async function insertSensorData(sensorDbId: number, gatewayDbId: number, payloadJson: string, db: Queryable = pool): Promise<number> {
  const result = await runSql(
    `INSERT INTO sensor_data (device_id, gateway_id, payload) VALUES (?, ?, ?) RETURNING id`,
    [sensorDbId, gatewayDbId, payloadJson],
    db
  );
  return result.insertId;
}

/** received_at do DB gán cho dòng vừa chèn (đường HTTP trả lại cho firmware). */
export async function getReceivedAt(id: number, db: Queryable = pool): Promise<Date | null> {
  const row = await queryOne<{ received_at: Date }>(`SELECT received_at FROM sensor_data WHERE id = ?`, [id], db);
  return row?.received_at ?? null;
}

/** Số dòng xoá mỗi lô của job dọn dữ liệu. */
export const PURGE_BATCH_SIZE = 5000;

// PostgreSQL không có DELETE … ORDER BY/LIMIT như MySQL: chọn id của một lô trong truy vấn con rồi xoá theo id.
// PURGE_BATCH_SIZE là hằng số nội bộ (không phải input) nên nối thẳng vào SQL.
const DELETE_TELEMETRY_SQL = `DELETE FROM sensor_data WHERE id IN (
  SELECT id FROM sensor_data WHERE received_at < ? ORDER BY received_at LIMIT ${PURGE_BATCH_SIZE})`;

/** Xoá một lô tối đa PURGE_BATCH_SIZE dòng cũ hơn `cutoff` (index idx_sensor_data_received); trả số dòng đã xoá. */
export async function deleteSensorDataBefore(cutoff: Date, db: Queryable = pool): Promise<number> {
  const result = await runSql(DELETE_TELEMETRY_SQL, [cutoff], db);
  return result.affectedRows;
}
