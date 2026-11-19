// Đẩy một số đo của thiết bị ảo qua đúng đường ingest của thiết bị thật (dùng cho random walk và route door).
import { onTelemetryIngested } from "../../telemetry";
import { insertSensorData, touchLastSeen } from "../infrastructure/simulator.repository";

/**
 * INSERT một số đo vào sensor_data rồi gọi onTelemetryIngested (bus + thông báo cửa mở), cuối cùng cập nhật
 * last_seen của sensor + gateway — đúng thứ tự của đường ingest thật (hook cần last_seen CŨ để biết thiết bị
 * vừa "sống lại"). Dùng cho cả random walk và route door.
 */
export async function ingestSimulatedReading(sensorDbId: number, gatewayDbId: number, data: Record<string, unknown>): Promise<void> {
  const receivedAt = new Date();
  await insertSensorData(sensorDbId, gatewayDbId, data, receivedAt);
  await onTelemetryIngested({ sensorDbId, gatewayDbId, data, receivedAt });
  await touchLastSeen(sensorDbId, gatewayDbId, receivedAt);
}
