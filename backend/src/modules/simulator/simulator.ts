// Simulator thiết bị ảo (CONTRACT_V2 §6): chỉ điều khiển các dòng devices.is_simulated = 1 — không bao giờ
// chạm thiết bị thật. Bật bằng env.deviceSimulator (mặc định bật khi không phải production).
//
//   heartbeat 20 s   last_seen=NOW() cho thiết bị ảo sim_online=1 của nhà chưa suspended; node chỉ "sống" khi
//                    gateway của nó cũng sống (sim_online=1 và không đang restart);
//   telemetry 60 s   random walk nhiệt độ 22–34 °C, độ ẩm 45–85 % cho cảm biến ảo → sensor_data +
//                    onTelemetryIngested (cùng hook với đường MQTT/HTTP);
//   lệnh             registerSimulatedCommandHandler: ack sau 300–900 ms như thiết bị thật. Lệnh gateway
//                    restart đi qua cùng handler (deviceCommand.service đã có sẵn điểm đăng ký này);
//   OTA 5 s          tiến độ ota_history của thiết bị ảo +10–25 %/lượt tới khi applied; khi mọi dòng của job
//                    đã applied → job completed.
// Trạng thái restart giữ ở RAM (không ghi sim_online): crash giữa chừng không để gateway kẹt offline vĩnh viễn.
import { env } from "../../config/env";
import { placeholders, queryOne, queryRows, runSql } from "../../lib/db";
import { logEvent } from "../logs/logEvent";
import { notifyStaff } from "../notifications/notification.service";
import { registerSimulatedCommandHandler, type SimulatedCommand, type SimulatedAck } from "../devices/deviceCommand.service";
import { onTelemetryIngested } from "../devices/telemetry.service";

const HEARTBEAT_INTERVAL_MS = 20_000;
const TELEMETRY_INTERVAL_MS = 60_000;
const OTA_INTERVAL_MS = 5_000;
const GATEWAY_RESTART_MS = 15_000;
const FIRST_TICK_DELAY_MS = 2_000;

const TEMP_RANGE = { min: 22, max: 34, centre: 28 } as const;
const HUMIDITY_RANGE = { min: 45, max: 85, centre: 65 } as const;

function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function randomInt(min: number, max: number): number {
  return Math.floor(randomBetween(min, max + 1));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

// ── Gateway restart (RAM) ──────────────────────────────────────────────────

/** gateway id → thời điểm (ms) hết restart. */
const restartingGateways = new Map<number, number>();

function isRestarting(gatewayId: number | null): boolean {
  if (gatewayId === null) return false;
  const until = restartingGateways.get(gatewayId);
  if (until === undefined) return false;
  if (Date.now() >= until) {
    restartingGateways.delete(gatewayId);
    return false;
  }
  return true;
}

/**
 * Hook restart gateway ảo: gateway (và các node của nó) im lặng 15 s rồi tự quay lại. Được handler lệnh
 * gateway của simulator gọi; export để route/test dùng lại.
 */
export function simulateGatewayRestart(gatewayId: number): void {
  restartingGateways.set(gatewayId, Date.now() + GATEWAY_RESTART_MS);
}

// ── Heartbeat ──────────────────────────────────────────────────────────────

interface HeartbeatCandidate {
  id: number;
  device_type: "sensor" | "gateway";
  gateway_device_id: number | null;
}

/** Đặt last_seen cho mọi thiết bị ảo đang "bật nguồn" (cũng được route power gọi để bật là lên ngay). */
export async function runSimulatedHeartbeat(): Promise<void> {
  try {
    const rows = await queryRows<HeartbeatCandidate>(
      `SELECT d.id, d.device_type, d.gateway_device_id
         FROM devices d
         LEFT JOIN smart_homes h ON h.id = d.home_id
         LEFT JOIN devices gw ON gw.id = d.gateway_device_id
        WHERE d.is_simulated = TRUE AND d.sim_online = TRUE
          AND (h.id IS NULL OR h.status <> 'suspended')
          AND (d.device_type = 'gateway' OR gw.id IS NULL OR gw.sim_online = TRUE)`
    );
    const alive = rows
      .filter((row) => !isRestarting(row.device_type === "gateway" ? row.id : row.gateway_device_id))
      .map((row) => row.id);
    if (alive.length === 0) return;
    await runSql(
      `UPDATE devices SET last_seen = NOW(), provision_status = 'provisioned'
        WHERE is_simulated = TRUE AND id IN (${placeholders(alive.length)})`,
      alive
    );
  } catch (err) {
    console.error("[simulator] heartbeat failed:", err instanceof Error ? err.message : "unknown error");
  }
}

// ── Telemetry ──────────────────────────────────────────────────────────────

/**
 * INSERT một số đo vào sensor_data rồi gọi onTelemetryIngested (bus + thông báo cửa mở), cuối cùng cập nhật
 * last_seen của sensor + gateway — đúng thứ tự của đường ingest thật (hook cần last_seen CŨ để biết thiết bị
 * vừa "sống lại"). Dùng cho cả random walk và route door.
 */
export async function ingestSimulatedReading(sensorDbId: number, gatewayDbId: number, data: Record<string, unknown>): Promise<void> {
  const receivedAt = new Date();
  await runSql("INSERT INTO sensor_data (device_id, gateway_id, payload, received_at) VALUES (?, ?, ?, ?)", [
    sensorDbId,
    gatewayDbId,
    JSON.stringify(data),
    receivedAt,
  ]);
  await onTelemetryIngested({ sensorDbId, gatewayDbId, data, receivedAt });
  await runSql("UPDATE devices SET last_seen = ?, provision_status = 'provisioned' WHERE id IN (?, ?)", [receivedAt, sensorDbId, gatewayDbId]);
}

const walkState = new Map<number, { temperature: number; humidity: number }>();

function nextWalk(deviceId: number): { temperature: number; humidity: number } {
  const prev = walkState.get(deviceId) ?? {
    temperature: randomBetween(25, 31),
    humidity: randomBetween(55, 75),
  };
  // Bước ngẫu nhiên + kéo nhẹ về giữa dải để không dính biên
  const temperature = clamp(
    prev.temperature + randomBetween(-0.7, 0.7) + (TEMP_RANGE.centre - prev.temperature) * 0.05,
    TEMP_RANGE.min,
    TEMP_RANGE.max
  );
  const humidity = clamp(
    prev.humidity + randomBetween(-2.5, 2.5) + (HUMIDITY_RANGE.centre - prev.humidity) * 0.05,
    HUMIDITY_RANGE.min,
    HUMIDITY_RANGE.max
  );
  const next = { temperature: Math.round(temperature * 10) / 10, humidity: Math.round(humidity * 10) / 10 };
  walkState.set(deviceId, next);
  return next;
}

interface SensorCandidate {
  id: number;
  gateway_device_id: number;
}

async function runTelemetryTick(): Promise<void> {
  try {
    const sensors = await queryRows<SensorCandidate>(
      `SELECT d.id, d.gateway_device_id
         FROM devices d
         JOIN devices gw ON gw.id = d.gateway_device_id
         LEFT JOIN smart_homes h ON h.id = d.home_id
        WHERE d.is_simulated = TRUE AND d.category = 'sensor' AND d.sim_online = TRUE AND gw.sim_online = TRUE
          AND (h.id IS NULL OR h.status <> 'suspended')`
    );
    for (const sensor of sensors) {
      if (isRestarting(sensor.gateway_device_id)) continue;
      try {
        await ingestSimulatedReading(sensor.id, sensor.gateway_device_id, nextWalk(sensor.id));
      } catch (err) {
        console.error("[simulator] telemetry failed:", err instanceof Error ? err.message : "unknown error");
      }
    }
  } catch (err) {
    console.error("[simulator] telemetry tick failed:", err instanceof Error ? err.message : "unknown error");
  }
}

// ── Lệnh ───────────────────────────────────────────────────────────────────

async function handleSimulatedCommand(command: SimulatedCommand): Promise<SimulatedAck> {
  await sleep(randomInt(300, 900)); // độ trễ như phần cứng thật
  if (command.kind === "gateway") {
    // restart/factory_reset: gateway im lặng một lúc rồi tự quay lại
    simulateGatewayRestart(command.device.id);
    return { status: "ok" };
  }
  // Gateway của relay đang restart → relay không nhận được lệnh
  if (isRestarting(command.device.gateway_device_id)) return { status: "error" };
  return { status: "ok", power: command.action === "turn_on" };
}

// ── OTA ────────────────────────────────────────────────────────────────────

interface OtaRow {
  history_id: number;
  ota_job_id: number;
  device_id: number;
  status: "pending" | "downloading";
  progress_percent: number;
  firmware_version: string;
}

async function finishJobIfDone(jobId: number): Promise<void> {
  // Một câu UPDATE nguyên tử: chỉ job còn 'running' mà MỌI dòng đã applied mới chuyển completed
  const done = await runSql(
    `UPDATE ota_jobs SET status = 'completed', finished_at = NOW()
      WHERE id = ? AND status = 'running'
        AND NOT EXISTS (SELECT 1 FROM ota_history WHERE ota_job_id = ? AND status <> 'applied')`,
    [jobId, jobId]
  );
  if (done.affectedRows === 0) return;

  const job = await queryOne<{ version: string; target_type: string; scope_type: string; scope_id: number | null }>(
    `SELECT f.version, f.target_type, j.scope_type, j.scope_id
       FROM ota_jobs j JOIN firmware f ON f.id = j.firmware_id WHERE j.id = ?`,
    [jobId]
  );
  const homeId = job?.scope_type === "home" ? job.scope_id : null;
  await logEvent({
    eventType: "OTA_COMPLETED",
    homeId,
    message: `Triển khai OTA #${jobId} hoàn tất${job ? ` (firmware ${job.version})` : ""}`,
    details: { ota_job_id: jobId, version: job?.version ?? null, target_type: job?.target_type ?? null },
  });
  await notifyStaff({
    targetRole: "all",
    type: "OTA_COMPLETED",
    title: "Cập nhật firmware hoàn tất",
    message: `Đợt cập nhật firmware${job ? ` ${job.version}` : ""} (#${jobId}) đã hoàn tất trên mọi thiết bị.`,
    severity: "success",
    homeId,
  });
}

let otaRunning = false;

async function runOtaTick(): Promise<void> {
  if (otaRunning) return;
  otaRunning = true;
  try {
    const rows = await queryRows<OtaRow>(
      `SELECT h.id AS history_id, h.ota_job_id, h.device_id, h.status, h.progress_percent, f.version AS firmware_version
         FROM ota_history h
         JOIN ota_jobs j ON j.id = h.ota_job_id AND j.status = 'running'
         JOIN firmware f ON f.id = j.firmware_id
         JOIN devices d ON d.id = h.device_id AND d.is_simulated = TRUE AND d.sim_online = TRUE
        WHERE h.status IN ('pending', 'downloading')`
    );
    const touchedJobs = new Set<number>();
    for (const row of rows) {
      try {
        const progress = Math.min(100, row.progress_percent + randomInt(10, 25));
        if (progress >= 100) {
          await runSql(
            `UPDATE ota_history SET status = 'applied', progress_percent = 100,
                    started_at = COALESCE(started_at, NOW()), finished_at = NOW()
              WHERE id = ? AND status IN ('pending', 'downloading')`,
            [row.history_id]
          );
          await runSql("UPDATE devices SET firmware_version = ? WHERE id = ? AND is_simulated = TRUE", [row.firmware_version, row.device_id]);
        } else {
          await runSql(
            `UPDATE ota_history SET status = 'downloading', progress_percent = ?, started_at = COALESCE(started_at, NOW())
              WHERE id = ? AND status IN ('pending', 'downloading')`,
            [progress, row.history_id]
          );
        }
        touchedJobs.add(row.ota_job_id);
      } catch (err) {
        console.error("[simulator] ota step failed:", err instanceof Error ? err.message : "unknown error");
      }
    }
    for (const jobId of touchedJobs) await finishJobIfDone(jobId);
  } catch (err) {
    console.error("[simulator] ota tick failed:", err instanceof Error ? err.message : "unknown error");
  } finally {
    otaRunning = false;
  }
}

// ── Khởi động ──────────────────────────────────────────────────────────────

let started = false;

export function startSimulator(): void {
  if (!env.deviceSimulator || started) return;
  started = true;
  registerSimulatedCommandHandler(handleSimulatedCommand);

  const timers = [
    setInterval(() => void runSimulatedHeartbeat(), HEARTBEAT_INTERVAL_MS),
    setInterval(() => void runTelemetryTick(), TELEMETRY_INTERVAL_MS),
    setInterval(() => void runOtaTick(), OTA_INTERVAL_MS),
    // Heartbeat + 1 số đo ngay sau khởi động để thiết bị demo online và có số liệu mới, không phải chờ 20–60 s
    setTimeout(() => {
      void runSimulatedHeartbeat().then(() => runTelemetryTick());
    }, FIRST_TICK_DELAY_MS),
  ];
  for (const timer of timers) timer.unref();
  console.log("[simulator] started");
}
