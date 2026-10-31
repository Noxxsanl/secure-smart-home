// SQL của simulator: chỉ chạm các dòng devices.is_simulated = TRUE (không bao giờ thiết bị thật). Simulator đóng vai
// firmware + broker nên được miễn quy tắc "không ghi bảng của module khác" (modules/README.md).
import { placeholders, queryOne, queryRows, runSql } from "../../../infrastructure/database/db";

// ── Heartbeat ──────────────────────────────────────────────────────────────

export interface HeartbeatCandidate {
  id: number;
  device_type: "sensor" | "gateway";
  gateway_device_id: number | null;
}

/** Thiết bị ảo đang bật nguồn của nhà chưa suspended; node chỉ "sống" khi gateway của nó cũng bật nguồn. */
export async function listHeartbeatCandidates(): Promise<HeartbeatCandidate[]> {
  return queryRows<HeartbeatCandidate>(
    `SELECT d.id, d.device_type, d.gateway_device_id
       FROM devices d
       LEFT JOIN smart_homes h ON h.id = d.home_id
       LEFT JOIN devices gw ON gw.id = d.gateway_device_id
      WHERE d.is_simulated = TRUE AND d.sim_online = TRUE
        AND (h.id IS NULL OR h.status <> 'suspended')
        AND (d.device_type = 'gateway' OR gw.id IS NULL OR gw.sim_online = TRUE)`
  );
}

export async function markSimulatedSeen(ids: readonly number[]): Promise<void> {
  await runSql(
    `UPDATE devices SET last_seen = NOW(), provision_status = 'provisioned'
      WHERE is_simulated = TRUE AND id IN (${placeholders(ids.length)})`,
    [...ids]
  );
}

/** Bật/tắt nguồn thiết bị ảo (route power). */
export async function setSimOnline(deviceId: number, online: boolean): Promise<void> {
  await runSql("UPDATE devices SET sim_online = ? WHERE id = ? AND is_simulated = TRUE", [online, deviceId]);
}

// ── Telemetry ──────────────────────────────────────────────────────────────

export async function insertSensorData(sensorDbId: number, gatewayDbId: number, data: Record<string, unknown>, receivedAt: Date): Promise<void> {
  await runSql("INSERT INTO sensor_data (device_id, gateway_id, payload, received_at) VALUES (?, ?, ?, ?)", [
    sensorDbId,
    gatewayDbId,
    JSON.stringify(data),
    receivedAt,
  ]);
}

export async function touchLastSeen(sensorDbId: number, gatewayDbId: number, receivedAt: Date): Promise<void> {
  await runSql("UPDATE devices SET last_seen = ?, provision_status = 'provisioned' WHERE id IN (?, ?)", [receivedAt, sensorDbId, gatewayDbId]);
}

export interface SensorCandidate {
  id: number;
  gateway_device_id: number;
}

export async function listTelemetrySensors(): Promise<SensorCandidate[]> {
  return queryRows<SensorCandidate>(
    `SELECT d.id, d.gateway_device_id
       FROM devices d
       JOIN devices gw ON gw.id = d.gateway_device_id
       LEFT JOIN smart_homes h ON h.id = d.home_id
      WHERE d.is_simulated = TRUE AND d.category = 'sensor' AND d.sim_online = TRUE AND gw.sim_online = TRUE
        AND (h.id IS NULL OR h.status <> 'suspended')`
  );
}

// ── OTA ────────────────────────────────────────────────────────────────────

export interface OtaRow {
  history_id: number;
  ota_job_id: number;
  device_id: number;
  status: "pending" | "downloading";
  progress_percent: number;
  firmware_version: string;
}

/** Dòng lịch sử OTA chưa xong của thiết bị ảo đang bật nguồn, thuộc job còn 'running'. */
export async function listOtaWork(): Promise<OtaRow[]> {
  return queryRows<OtaRow>(
    `SELECT h.id AS history_id, h.ota_job_id, h.device_id, h.status, h.progress_percent, f.version AS firmware_version
       FROM ota_history h
       JOIN ota_jobs j ON j.id = h.ota_job_id AND j.status = 'running'
       JOIN firmware f ON f.id = j.firmware_id
       JOIN devices d ON d.id = h.device_id AND d.is_simulated = TRUE AND d.sim_online = TRUE
      WHERE h.status IN ('pending', 'downloading')`
  );
}

export async function markOtaApplied(historyId: number): Promise<void> {
  await runSql(
    `UPDATE ota_history SET status = 'applied', progress_percent = 100,
            started_at = COALESCE(started_at, NOW()), finished_at = NOW()
      WHERE id = ? AND status IN ('pending', 'downloading')`,
    [historyId]
  );
}

export async function setSimulatedFirmwareVersion(deviceId: number, version: string): Promise<void> {
  await runSql("UPDATE devices SET firmware_version = ? WHERE id = ? AND is_simulated = TRUE", [version, deviceId]);
}

export async function markOtaDownloading(historyId: number, progress: number): Promise<void> {
  await runSql(
    `UPDATE ota_history SET status = 'downloading', progress_percent = ?, started_at = COALESCE(started_at, NOW())
      WHERE id = ? AND status IN ('pending', 'downloading')`,
    [progress, historyId]
  );
}

/** Một câu UPDATE nguyên tử: chỉ job còn 'running' mà MỌI dòng đã applied mới chuyển completed. */
export async function completeJobIfAllApplied(jobId: number): Promise<boolean> {
  const done = await runSql(
    `UPDATE ota_jobs SET status = 'completed', finished_at = NOW()
      WHERE id = ? AND status = 'running'
        AND NOT EXISTS (SELECT 1 FROM ota_history WHERE ota_job_id = ? AND status <> 'applied')`,
    [jobId, jobId]
  );
  return done.affectedRows > 0;
}

export async function getJobSummary(jobId: number): Promise<{ version: string; target_type: string; scope_type: string; scope_id: number | null } | null> {
  return queryOne<{ version: string; target_type: string; scope_type: string; scope_id: number | null }>(
    `SELECT f.version, f.target_type, j.scope_type, j.scope_id
       FROM ota_jobs j JOIN firmware f ON f.id = j.firmware_id WHERE j.id = ?`,
    [jobId]
  );
}
