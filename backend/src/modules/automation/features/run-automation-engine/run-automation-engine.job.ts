// Worker của automation engine: nghe bus `telemetry` (rule ngưỡng) + timer 30 s (rule lịch).
// Logic đánh giá/thực thi ở run-automation-engine.handler.ts.
import { eventBus } from "../../../../shared/events/event-bus";
import { SCHEDULE_TICK_MS } from "../../domain/engine-policy";
import { handleTelemetry, runScheduleTick } from "./run-automation-engine.handler";

let started = false;

export function startAutomationEngine(): void {
  if (started) return;
  started = true;
  eventBus.on("telemetry", (event) => handleTelemetry(event));
  const timer = setInterval(() => void runScheduleTick(), SCHEDULE_TICK_MS);
  timer.unref();
}
