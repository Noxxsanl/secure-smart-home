import type { TelemetryRange } from "./telemetry.types";

export const TELEMETRY_RANGES: readonly TelemetryRange[] = ["24h", "7d"];

/** Độ rộng bucket AVG (giây): 5 phút cho 24h, 1 giờ cho 7d. */
export const BUCKET_SECONDS: Record<TelemetryRange, number> = { "24h": 300, "7d": 3600 };
export const RANGE_MS: Record<TelemetryRange, number> = { "24h": 24 * 3600 * 1000, "7d": 7 * 24 * 3600 * 1000 };
