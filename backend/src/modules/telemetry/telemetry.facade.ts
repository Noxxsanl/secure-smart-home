// Facade của module telemetry: hàm/kiểu mà module khác được gọi (qua index.ts).
// onTelemetryIngested còn được simulator gọi sau khi tự INSERT sensor_data (cùng hook với hai đường ingest thật).
export { onTelemetryIngested } from "./domain/telemetry-ingested";
export type { TelemetryIngestInput, TelemetryPoint, TelemetryRange, TelemetrySeries } from "./domain/telemetry.types";
