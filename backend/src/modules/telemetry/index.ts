// Cửa ra DUY NHẤT của module telemetry: module khác chỉ được import từ đây (quy tắc phụ thuộc, modules/README.md).
// Danh sách tường minh từ telemetry.facade.ts — worker (ingest-mqtt, purge-old-telemetry) gắn qua telemetry.module.ts.
export { telemetryModule } from "./telemetry.module";
export { onTelemetryIngested } from "./telemetry.facade";
export type { TelemetryIngestInput, TelemetryPoint, TelemetryRange, TelemetrySeries } from "./telemetry.facade";
