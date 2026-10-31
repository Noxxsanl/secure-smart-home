// Simulator thiết bị ảo (CONTRACT_V2 §6) — phần việc theo chu kỳ + handler lệnh; job.ts nối vào timer.
// Chỉ điều khiển các dòng devices.is_simulated = 1 — không bao giờ chạm thiết bị thật.
//
//   telemetry 60 s   random walk nhiệt độ 22–34 °C, độ ẩm 45–85 % cho cảm biến ảo → sensor_data +
//                    onTelemetryIngested (cùng hook với đường MQTT/HTTP);
//   lệnh             registerSimulatedCommandHandler: ack sau 300–900 ms như thiết bị thật. Lệnh gateway
//                    restart đi qua cùng handler (control đã có sẵn điểm đăng ký này);
//   OTA 5 s          tiến độ ota_history của thiết bị ảo +10–25 %/lượt tới khi applied; khi mọi dòng của job
//                    đã applied → job completed.
// (heartbeat 20 s nằm ở domain/simulated-heartbeat.ts vì route power cũng dùng.)
import type { SimulatedAck, SimulatedCommand } from "../../../control";
import { logEvent } from "../../../audit";
import { notifyStaff } from "../../../notifications";
import { isRestarting, simulateGatewayRestart } from "../../domain/gateway-restart";
import { randomInt, sleep } from "../../domain/random";
import { ingestSimulatedReading } from "../../domain/simulated-reading";
import { nextWalk } from "../../domain/telemetry-walk";
import {
  completeJobIfAllApplied,
  getJobSummary,
  listOtaWork,
  listTelemetrySensors,
  markOtaApplied,
  markOtaDownloading,
  setSimulatedFirmwareVersion,
} from "../../infrastructure/simulator.repository";

// ── Telemetry ──────────────────────────────────────────────────────────────

export async function runTelemetryTick(): Promise<void> {
  try {
    const sensors = await listTelemetrySensors();
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

export async function handleSimulatedCommand(command: SimulatedCommand): Promise<SimulatedAck> {
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

async function finishJobIfDone(jobId: number): Promise<void> {
  // Một câu UPDATE nguyên tử: chỉ job còn 'running' mà MỌI dòng đã applied mới chuyển completed
  if (!(await completeJobIfAllApplied(jobId))) return;

  const job = await getJobSummary(jobId);
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

export async function runOtaTick(): Promise<void> {
  if (otaRunning) return;
  otaRunning = true;
  try {
    const rows = await listOtaWork();
    const touchedJobs = new Set<number>();
    for (const row of rows) {
      try {
        const progress = Math.min(100, row.progress_percent + randomInt(10, 25));
        if (progress >= 100) {
          await markOtaApplied(row.history_id);
          await setSimulatedFirmwareVersion(row.device_id, row.firmware_version);
        } else {
          await markOtaDownloading(row.history_id, progress);
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
