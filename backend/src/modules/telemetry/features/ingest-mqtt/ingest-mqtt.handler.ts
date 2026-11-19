// Xử lý một message gateway/<GW_ID>/data trên Broker MQTT. Xác thực bằng CÙNG hàm với đường HTTP fallback
// (domain/ingest-auth.ts — invariant 4): chữ ký v2 2 lớp, gateway trên topic = gateway_id trong payload (broker cưỡng chế
// topic bằng mTLS + ACL), node thuộc đúng gateway, chống phát lại bằng sn_ctr. Sau đó kiểm trạng thái → lưu → hook.
import { logDataRecvWithPrune } from "../../../audit";
import { listGatewayAndSensorTypeStatus } from "../../../devices";
import { authenticateTelemetry } from "../../domain/ingest-auth";
import { markGatewayAndSensorSeen } from "../../domain/ingest-common";
import { onTelemetryIngested } from "../../domain/telemetry-ingested";
import { gatewayUidFromDataTopic } from "../../domain/telemetry-envelope";
import { insertSensorData } from "../../infrastructure/sensor-data.repository";

export async function handleGatewayData(topic: string, raw: string): Promise<void> {
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    console.warn("[mqttData] invalid JSON – dropped");
    return;
  }

  const topicGatewayUid = gatewayUidFromDataTopic(topic);
  const auth = await authenticateTelemetry(body, { source: "mqtt", topicGatewayUid, ip: null, userAgent: null });
  if (!auth.ok) {
    const { error, reason } = auth.rejection;
    console.warn(`[mqttData] ${topicGatewayUid ?? "?"}: rejected ${error}${reason ? ` (${reason})` : ""}`);
    return;
  }
  const { gateway, sensor, data, dataJson, gatewayIp, sensorIp } = auth.telemetry;

  // Trạng thái hiện tại (đọc lại, có thể vừa bị khoá/vô hiệu hoá trên Dashboard)
  const rows = await listGatewayAndSensorTypeStatus(gateway.id, sensor.id);
  const gwRow = rows.find((r) => r.id === gateway.id);
  const snRow = rows.find((r) => r.id === sensor.id);
  if (gwRow?.status !== "active") {
    console.warn(`[mqttData] gateway ${gateway.device_id} status=${gwRow?.status ?? "missing"} – dropped`);
    return;
  }
  if (snRow?.status !== "active") {
    console.warn(`[mqttData] sensor ${sensor.device_id} status=${snRow?.status ?? "missing"} – dropped`);
    return;
  }

  const dataId = await insertSensorData(sensor.id, gateway.id, dataJson);

  // sensor_data giữ theo THỜI GIAN (job purge-old-telemetry). Hook phát bus telemetry/device_state + thông báo cửa mở —
  // gọi TRƯỚC khi cập nhật last_seen vì hook cần last_seen cũ để biết thiết bị vừa online trở lại; hook không ném lỗi.
  await onTelemetryIngested({
    sensorDbId: sensor.id,
    gatewayDbId: gateway.id,
    data,
    receivedAt: new Date(),
  });

  await markGatewayAndSensorSeen(gateway.id, gatewayIp, sensor.id, sensorIp, data);

  await logDataRecvWithPrune(sensor.id, null, null, {
    gateway_id: gateway.device_id,
    sensor_id: sensor.device_id,
    data_id: dataId,
    source: "mqtt",
  });

  console.log(`[mqttData] saved id=${dataId} from ${sensor.device_id} via ${gateway.device_id}`);
}
