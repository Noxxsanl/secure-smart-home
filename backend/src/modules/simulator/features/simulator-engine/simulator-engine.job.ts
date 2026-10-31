// Worker của simulator thiết bị ảo: heartbeat 20 s, telemetry 60 s, OTA 5 s + đăng ký handler lệnh giả lập.
// Bật bằng env.deviceSimulator (mặc định bật khi không phải production). Logic ở simulator-engine.handler.ts.
import { env } from "../../../../config/env";
import { registerSimulatedCommandHandler } from "../../../control";
import { runSimulatedHeartbeat } from "../../domain/simulated-heartbeat";
import { handleSimulatedCommand, runOtaTick, runTelemetryTick } from "./simulator-engine.handler";

const HEARTBEAT_INTERVAL_MS = 20_000;
const TELEMETRY_INTERVAL_MS = 60_000;
const OTA_INTERVAL_MS = 5_000;
const FIRST_TICK_DELAY_MS = 2_000;

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
