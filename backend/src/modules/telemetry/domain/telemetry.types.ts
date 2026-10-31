// Kiểu dữ liệu của domain telemetry (CONTRACT_V2 §4.2, §6): chuỗi thời gian nhiệt/ẩm và đầu vào hook ingest.
import type { Reading } from "../../../shared/events/event-payloads";

export type TelemetryRange = "24h" | "7d";

export interface TelemetryPoint {
  /** ISO-8601 UTC — đầu bucket. */
  t: string;
  temperature: number | null;
  humidity: number | null;
}

export interface TelemetrySeries {
  device_id: number;
  range: TelemetryRange;
  /** 300 (24h) hoặc 3600 (7d). */
  bucket_seconds: number;
  points: TelemetryPoint[];
  latest: Reading | null;
}

export interface TelemetryIngestInput {
  /** devices.id của sensor đã xác thực. */
  sensorDbId: number;
  /** devices.id của gateway đã xác thực. */
  gatewayDbId: number;
  /** Payload số đo đã kiểm là object (`{temperature, humidity}` hoặc `{door_open}`…). */
  data: Record<string, unknown>;
  /** Thời điểm nhận (≈ received_at của dòng vừa insert). */
  receivedAt: Date;
}
