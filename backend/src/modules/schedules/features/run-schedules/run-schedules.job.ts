// Worker scheduleRunner: tick 5 s, chạy 1 tick ngay khi start. Logic ở run-schedules.handler.ts.
import { runScheduleTick } from "./run-schedules.handler";

/** Chu kỳ quét lịch đến hạn — sai số chạy ≤ ~5 s (tiêu chí nghiệm thu 1A). */
export const SCHEDULE_RUNNER_TICK_MS = 5_000;

let started = false;

export function startScheduleRunner(): void {
  if (started) return;
  started = true;
  void runScheduleTick();
  const timer = setInterval(() => void runScheduleTick(), SCHEDULE_RUNNER_TICK_MS);
  timer.unref();
}
