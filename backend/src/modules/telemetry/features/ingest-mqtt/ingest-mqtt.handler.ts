// Xử lý một message gateway/<GW_ID>/data trên Broker 2: xác thực HMAC 2 lớp giống hệt đường fallback HTTP
// (features/ingest-http). Hai đường gọi CÙNG các hàm của module devices (verifyGatewayHMAC, verifyDeviceHMAC,
// registerAuthFailure, listGatewayAndSensorTypeStatus) và telemetry/domain (onTelemetryIngested,
// markGatewayAndSensorSeen) — khi đổi logic xác thực phải đổi cả hai feature (invariant 4).
import { log, logDataRecvWithPrune } from "../../../audit";
import {
  isSafeDeviceId,
  jsonHasNul,
  listGatewayAndSensorTypeStatus,
  registerAuthFailure,
  verifyDeviceHMAC,
  verifyGatewayHMAC,
} from "../../../devices";
import { authFailureEventType, markGatewayAndSensorSeen } from "../../domain/ingest-common";
import { onTelemetryIngested } from "../../domain/telemetry-ingested";
import { insertSensorData } from "../../infrastructure/sensor-data.repository";

async function incrementAndMaybeBlock(deviceDbId: number, deviceLabel: string): Promise<void> {
  // Tăng fail_count (LEAST(…, 1000) chống tràn SMALLINT) và khoá thiết bị khi đạt ngưỡng — chính sách chung với đường HTTP.
  const { failCount, blocked } = await registerAuthFailure(deviceDbId);
  if (blocked) {
    await log("DEVICE_BLOCKED", deviceDbId, null, null, { device_id: deviceLabel, fail_count: failCount, source: "mqtt" });
    console.warn(`[mqttData] blocked ${deviceLabel} (fail_count=${failCount})`);
  }
}

export async function handleGatewayData(raw: string): Promise<void> {
  let body: any;
  try {
    body = JSON.parse(raw);
  } catch {
    console.warn("[mqttData] invalid JSON – dropped");
    return;
  }

  const { gateway_id, gw_timestamp, gw_hmac, gateway_ip, sensor_payload } = body;
  const sensor_id    = sensor_payload?.sensor_id;
  const sn_timestamp = sensor_payload?.sn_timestamp;
  const sn_hmac      = sensor_payload?.sn_hmac;
  const sensor_ip    = sensor_payload?.sensor_ip;
  const data         = sensor_payload?.data;

  // isSafeDeviceId: id không phải chuỗi hoặc chứa NUL = payload sai (khớp validate-device.middleware; tránh lỗi 22021 của PostgreSQL).
  if (!isSafeDeviceId(gateway_id) || !gw_timestamp || !gw_hmac) {
    console.warn("[mqttData] missing gateway fields – dropped");
    return;
  }

  // Level 1: Gateway HMAC
  const gwResult = await verifyGatewayHMAC(gateway_id, Number(gw_timestamp), gw_hmac);
  if (!gwResult.ok) {
    await log(authFailureEventType("gateway", gwResult.error), gwResult.device?.id ?? null, null, null, {
      gateway_id,
      reason: gwResult.error,
      source: "mqtt",
    });
    if (gwResult.device?.id) await incrementAndMaybeBlock(gwResult.device.id, gateway_id);
    console.warn(`[mqttData] gateway auth fail (${gwResult.error}): ${gateway_id}`);
    return;
  }

  // Level 2: Sensor HMAC
  if (!sensor_payload || !isSafeDeviceId(sensor_id) || !sn_timestamp || !sn_hmac) {
    console.warn("[mqttData] missing sensor fields – dropped");
    return;
  }

  const snResult = await verifyDeviceHMAC(sensor_id, Number(sn_timestamp), sn_hmac);
  if (!snResult.ok) {
    await log(authFailureEventType("sensor", snResult.error), snResult.device?.id ?? null, null, null, {
      sensor_id,
      reason: snResult.error,
      source: "mqtt",
    });
    if (snResult.device?.id) await incrementAndMaybeBlock(snResult.device.id, sensor_id);
    console.warn(`[mqttData] sensor auth fail (${snResult.error}): ${sensor_id}`);
    return;
  }

  const gateway = gwResult.device!;
  const sensor  = snResult.device!;

  if (!data || typeof data !== "object" || Array.isArray(data)) {
    console.warn("[mqttData] missing or invalid data payload – dropped");
    return;
  }
  // JSONB không nhận `\u0000` (22P05) → coi như payload sai, khớp features/ingest-http.
  const dataJson = JSON.stringify(data);
  if (jsonHasNul(dataJson)) {
    console.warn("[mqttData] data payload contains NUL – dropped");
    return;
  }

  // Device type & status check
  const rows = await listGatewayAndSensorTypeStatus(gateway.id, sensor.id);
  const gwRow = rows.find((r) => r.id === gateway.id);
  const snRow = rows.find((r) => r.id === sensor.id);

  if (!gwRow || gwRow.device_type !== "gateway") {
    console.warn(`[mqttData] ${gateway_id} is not a gateway – dropped`);
    return;
  }
  if (!snRow || snRow.device_type !== "sensor") {
    console.warn(`[mqttData] ${sensor_id} is not a sensor – dropped`);
    return;
  }
  if (gwRow.status !== "active") {
    console.warn(`[mqttData] gateway ${gateway_id} status=${gwRow.status} – dropped`);
    return;
  }
  if (snRow.status !== "active") {
    console.warn(`[mqttData] sensor ${sensor_id} status=${snRow.status} – dropped`);
    return;
  }

  // Insert sensor data
  const dataId = await insertSensorData(sensor.id, gateway.id, dataJson);

  // V2: không còn prune "150 dòng/sensor" ở đây — sensor_data giữ theo THỜI GIAN (job purge-old-telemetry
  // hằng giờ, TELEMETRY_RETENTION_DAYS) để biểu đồ 7 ngày có đủ dữ liệu.
  // Hook phát bus telemetry/device_state + thông báo cửa mở. Gọi TRƯỚC khi cập nhật last_seen bên
  // dưới vì hook cần last_seen cũ để biết thiết bị vừa online trở lại; hook không bao giờ ném lỗi.
  await onTelemetryIngested({
    sensorDbId: sensor.id,
    gatewayDbId: gateway.id,
    data,
    receivedAt: new Date(),
  });

  const resolvedGwIp = typeof gateway_ip === "string" && gateway_ip ? gateway_ip : null;
  const resolvedSnIp = typeof sensor_ip  === "string" && sensor_ip  ? sensor_ip  : null;

  await markGatewayAndSensorSeen(gateway.id, resolvedGwIp, sensor.id, resolvedSnIp);

  await logDataRecvWithPrune(sensor.id, null, null, {
    gateway_id: gateway.device_id,
    sensor_id:  sensor.device_id,
    data_id:    dataId,
    source:     "mqtt",
  });

  console.log(`[mqttData] saved id=${dataId} from ${sensor_id} via ${gateway_id}`);
}
