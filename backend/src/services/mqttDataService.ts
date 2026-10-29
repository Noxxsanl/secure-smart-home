// Đường nhận dữ liệu chính: subscribe Broker 2 (gateway → backend) và
// thực hiện xác thực HMAC 2 lớp giống hệt đường fallback HTTP (data.routes.ts).
// Hai đường phải luôn đồng bộ logic xác thực khi có thay đổi.
import { queryOne, queryRows, runSql } from "../lib/db";
import { connectBroker } from "../config/mqtt";
import { onTelemetryIngested } from "../modules/devices/telemetry.service";
import { isSafeDeviceId, jsonHasNul, verifyGatewayHMAC, verifyDeviceHMAC } from "./hmacService";
import { log, logDataRecvWithPrune } from "./auditLogger";

// Thiết bị bị tự động khóa sau số lần xác thực thất bại liên tiếp này
// để ngăn tấn công brute-force vào secret key HMAC.
const BLOCK_THRESHOLD = 5;

async function incrementAndMaybeBlock(deviceDbId: number, deviceLabel: string): Promise<void> {
  // LEAST(…, 1000): chống tràn SMALLINT khi thiết bị đã blocked vẫn bị đếm tiếp — khớp validateDevice.ts.
  await runSql(`UPDATE devices SET fail_count = LEAST(fail_count + 1, 1000) WHERE id = ?`, [deviceDbId]);
  const row = await queryOne<{ fail_count: number }>(`SELECT fail_count FROM devices WHERE id = ?`, [deviceDbId]);
  const count: number = row?.fail_count ?? 0;
  if (count >= BLOCK_THRESHOLD) {
    await runSql(`UPDATE devices SET status = 'blocked' WHERE id = ?`, [deviceDbId]);
    await log("DEVICE_BLOCKED", deviceDbId, null, null, { device_id: deviceLabel, fail_count: count, source: "mqtt" });
    console.warn(`[mqttData] blocked ${deviceLabel} (fail_count=${count})`);
  }
}

async function handleGatewayData(raw: string): Promise<void> {
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

  // isSafeDeviceId: id không phải chuỗi hoặc chứa NUL = payload sai (khớp validateDevice.ts; tránh lỗi 22021 của PostgreSQL).
  if (!isSafeDeviceId(gateway_id) || !gw_timestamp || !gw_hmac) {
    console.warn("[mqttData] missing gateway fields – dropped");
    return;
  }

  // Level 1: Gateway HMAC
  const gwResult = await verifyGatewayHMAC(gateway_id, Number(gw_timestamp), gw_hmac);
  if (!gwResult.ok) {
    await log("GATEWAY_AUTH_FAIL", gwResult.device?.id ?? null, null, null, {
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
    await log("SENSOR_AUTH_FAIL", snResult.device?.id ?? null, null, null, {
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
  // JSONB không nhận `\u0000` (22P05) → coi như payload sai, khớp routes/data.routes.ts.
  const dataJson = JSON.stringify(data);
  if (jsonHasNul(dataJson)) {
    console.warn("[mqttData] data payload contains NUL – dropped");
    return;
  }

  // Device type & status check
  const rows = await queryRows<{ id: number; device_type: string; status: string }>(
    `SELECT id, device_type, status FROM devices WHERE id IN (?, ?)`,
    [gateway.id, sensor.id]
  );
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
  const insertResult = await runSql(
    `INSERT INTO sensor_data (device_id, gateway_id, payload) VALUES (?, ?, ?) RETURNING id`,
    [sensor.id, gateway.id, dataJson]
  );

  // V2: không còn prune "150 dòng/sensor" ở đây — sensor_data giữ theo THỜI GIAN (job retention
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

  if (resolvedGwIp) {
    await runSql(
      `UPDATE devices SET last_seen = NOW(), fail_count = 0, last_ip = ? WHERE id = ?`,
      [resolvedGwIp, gateway.id]
    );
  } else {
    await runSql(
      `UPDATE devices SET last_seen = NOW(), fail_count = 0 WHERE id = ?`,
      [gateway.id]
    );
  }

  if (resolvedSnIp) {
    await runSql(
      `UPDATE devices SET last_seen = NOW(), fail_count = 0, last_ip = ? WHERE id = ?`,
      [resolvedSnIp, sensor.id]
    );
  } else {
    await runSql(
      `UPDATE devices SET last_seen = NOW(), fail_count = 0 WHERE id = ?`,
      [sensor.id]
    );
  }

  await logDataRecvWithPrune(sensor.id, null, null, {
    gateway_id: gateway.device_id,
    sensor_id:  sensor.device_id,
    data_id:    insertResult.insertId,
    source:     "mqtt",
  });

  console.log(`[mqttData] saved id=${insertResult.insertId} from ${sensor_id} via ${gateway_id}`);
}

export function startMqttDataService(): void {
  // Broker 2 (gateway → backend layer), MQTT over TLS
  const client = connectBroker("iot-backend-data");

  client.on("connect", () => {
    console.log("[mqttData] connected, subscribing to gateway/+/data");
    client.subscribe("gateway/+/data", { qos: 1 });
  });

  client.on("message", (_topic: string, payload: Buffer) => {
    handleGatewayData(payload.toString()).catch((err) =>
      console.error("[mqttData] unhandled error:", err.message)
    );
  });

  client.on("error", (err) => {
    console.error("[mqttData] error:", err.message);
  });
}
