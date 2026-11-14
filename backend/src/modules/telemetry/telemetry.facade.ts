// Facade của module telemetry: hàm/kiểu mà module khác được gọi (qua index.ts).
// onTelemetryIngested còn được simulator gọi sau khi tự INSERT sensor_data (cùng hook với hai đường ingest thật).
export { onTelemetryIngested } from "./domain/telemetry-ingested";
// Nhiệt độ/độ ẩm gần nhất của phòng — control ghi kèm vào nhật ký hành vi (user_behavior_logs).
export { getRoomClimate } from "./domain/room-climate";
// Loại sự kiện audit khi HMAC thất bại — module camera dùng lại để Log Center thấy cùng loại với ingest (REPLAY_ATTACK…).
export { authFailureEventType } from "./domain/ingest-common";
export type { RoomClimate, TelemetryIngestInput, TelemetryPoint, TelemetryRange, TelemetrySeries } from "./domain/telemetry.types";
