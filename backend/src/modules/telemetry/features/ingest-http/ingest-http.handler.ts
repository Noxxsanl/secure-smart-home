// POST /api/device/data – đường fallback HTTP để firmware đẩy dữ liệu lên.
// Đường chính là MQTT (features/ingest-mqtt); endpoint này tồn tại để các thiết bị không kết nối được tới
// MQTT broker (ví dụ: khác network segment) vẫn có thể gửi dữ liệu qua HTTP thông thường. Cả hai đường đều
// xác thực HMAC 2 lớp bằng CÙNG các hàm của module devices (invariant 4) — ở đây là phần SAU middleware validate-device:
// kiểm loại/trạng thái thiết bị → INSERT sensor_data → onTelemetryIngested → cập nhật last_seen → audit.
import { log, logDataRecvWithPrune } from "../../../audit";
import { jsonHasNul, listGatewayAndSensorTypeStatus } from "../../../devices";
import { markGatewayAndSensorSeen } from "../../domain/ingest-common";
import { onTelemetryIngested } from "../../domain/telemetry-ingested";
import { getReceivedAt, insertSensorData } from "../../infrastructure/sensor-data.repository";
import type { IngestHttpInput, IngestHttpResult } from "./ingest-http.dto";

export async function ingestHttpData(input: IngestHttpInput): Promise<IngestHttpResult> {
  const { gateway, sensor, ip, userAgent, data } = input;

  if (data === undefined || data === null || typeof data !== "object" || Array.isArray(data)) {
    return { status: 400, body: { error: "MISSING_PAYLOAD_DATA", detail: "Request body must include a 'data' object" } };
  }
  // JSONB không nhận `\u0000` (22P05) → coi như payload sai, khớp features/ingest-mqtt.
  const dataJson = JSON.stringify(data);
  if (jsonHasNul(dataJson)) {
    return { status: 400, body: { error: "MISSING_PAYLOAD_DATA", detail: "'data' must not contain NUL characters" } };
  }

  // Fetch device_type and current status from DB (single round-trip for both devices)
  const rows = await listGatewayAndSensorTypeStatus(gateway.id, sensor.id);

  const gwRow = rows.find((r) => r.id === gateway.id);
  const snRow = rows.find((r) => r.id === sensor.id);

  // RBAC: device_type check
  if (!gwRow || gwRow.device_type !== "gateway") {
    await log("PRIVILEGE_ESCALATION", gateway.id, ip, userAgent, {
      gateway_id: gateway.device_id,
      actual_type: gwRow?.device_type ?? "unknown",
      reason: "device_type_not_gateway",
    });
    return { status: 403, body: { error: "INVALID_DEVICE_TYPE", detail: "gateway_id must be a gateway device" } };
  }
  if (!snRow || snRow.device_type !== "sensor") {
    await log("PRIVILEGE_ESCALATION", sensor.id, ip, userAgent, {
      sensor_id: sensor.device_id,
      actual_type: snRow?.device_type ?? "unknown",
      reason: "device_type_not_sensor",
    });
    return { status: 403, body: { error: "INVALID_DEVICE_TYPE", detail: "sensor_id must be a sensor device" } };
  }

  // Status check: both must be active
  if (gwRow.status === "blocked") {
    return { status: 403, body: { error: "DEVICE_BLOCKED", detail: "Gateway is blocked" } };
  }
  if (gwRow.status !== "active") {
    return { status: 403, body: { error: "DEVICE_NOT_ACTIVE", detail: "Gateway is not active" } };
  }
  if (snRow.status === "blocked") {
    return { status: 403, body: { error: "DEVICE_BLOCKED", detail: "Sensor is blocked" } };
  }
  if (snRow.status !== "active") {
    return { status: 403, body: { error: "DEVICE_NOT_ACTIVE", detail: "Sensor is not active" } };
  }

  // Insert sensor data
  const dataId = await insertSensorData(sensor.id, gateway.id, dataJson);

  // Fetch received_at from the newly inserted row
  const receivedAt: Date = (await getReceivedAt(dataId)) ?? new Date();

  // V2: không còn prune "150 dòng/sensor" ở đây — sensor_data giữ theo THỜI GIAN (job purge-old-telemetry
  // hằng giờ, TELEMETRY_RETENTION_DAYS) để biểu đồ 7 ngày có đủ dữ liệu.
  // Hook phát bus telemetry/device_state + thông báo cửa mở. Gọi TRƯỚC khi cập nhật last_seen bên
  // dưới vì hook cần last_seen cũ để biết thiết bị vừa online trở lại; hook không bao giờ ném lỗi.
  await onTelemetryIngested({
    sensorDbId: sensor.id,
    gatewayDbId: gateway.id,
    data: data as Record<string, unknown>,
    receivedAt,
  });

  // Dùng IP do firmware tự báo (gateway_ip / sensor_ip trong body).
  // Fallback về HTTP client IP nếu firmware cũ chưa gửi field này.
  const resolvedGwIp  = (typeof input.gatewayIp === "string" && input.gatewayIp) ? input.gatewayIp : ip;
  const resolvedSnIp  = (typeof input.sensorIp === "string" && input.sensorIp) ? input.sensorIp : null;

  await markGatewayAndSensorSeen(gateway.id, resolvedGwIp, sensor.id, resolvedSnIp);

  // Audit log
  await logDataRecvWithPrune(sensor.id, ip, userAgent, {
    gateway_id: gateway.device_id,
    sensor_id: sensor.device_id,
    data_id: dataId,
  });

  return {
    status: 200,
    body: {
      success: true,
      sensor_id: sensor.device_id,
      gateway_id: gateway.device_id,
      received_at: receivedAt,
    },
  };
}
