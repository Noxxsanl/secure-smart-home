// Kết nối Broker MQTT (gateway ↔ backend) bằng MQTT over TLS hai chiều (mTLS) — FR-12.3, FR-12.4, NFR-S1.
// telemetry/ingest-mqtt, devices/gateway-heartbeat, camera/camera-event và control/command-ack dùng chung hàm này.
//
// Mỗi kết nối là MỘT danh tính trên broker: chứng chỉ client CN = tên kết nối (iot-backend-data, iot-backend-commands,
// iot-backend-heartbeat, iot-backend-camera — sinh bởi infra/pki/gen_mqtt_certs.sh). Broker dùng CN làm username
// (use_identity_as_username) và làm client id (use_username_as_clientid), ACL (infra/mosquitto/acl) cấp đúng topic cho
// từng tên — không ai kết nối ẩn danh, không ai chiếm được client id của người khác.
import fs from "fs";
import path from "path";
import mqtt, { MqttClient } from "mqtt";

const host = process.env.MQTT_HOST || "localhost";
const port = Number(process.env.MQTT_PORT) || 8883;
// Mặc định trỏ tới file do infra/pki/gen_mqtt_certs.sh sinh, khi chạy backend từ thư mục backend/
const caFile = path.resolve(process.env.MQTT_CA_FILE || "../infra/mosquitto/certs/ca.crt");
const clientCertDir = path.resolve(process.env.MQTT_CLIENT_CERT_DIR || "../infra/mosquitto/certs/clients");

function readOrExit(file: string, what: string): Buffer {
  try {
    return fs.readFileSync(file);
  } catch {
    console.error(`[startup] Cannot read ${what} at ${file} – run infra/pki/gen_mqtt_certs.sh (see docs/guides/MQTT_TLS.md)`);
    process.exit(1);
  }
}

// Đọc ngay khi load module (giống config/env.ts) để thiếu CA thì dừng lúc khởi động
const ca = readOrExit(caFile, "MQTT CA certificate");

/** Tên kết nối hợp lệ = tên file chứng chỉ client (chống path traversal khi ai đó truyền tên lạ). */
const CLIENT_NAME = /^iot-backend-[a-z]+$/;

export function connectBroker(clientName: string): MqttClient {
  if (!CLIENT_NAME.test(clientName)) throw new Error(`invalid MQTT client name: ${clientName}`);
  const cert = readOrExit(path.join(clientCertDir, `${clientName}.crt`), `MQTT client certificate (${clientName})`);
  const key = readOrExit(path.join(clientCertDir, `${clientName}.key`), `MQTT client key (${clientName})`);
  return mqtt.connect(`mqtts://${host}:${port}`, {
    ca,
    cert,
    key,
    // Luôn kiểm chứng chứng chỉ broker (chữ ký CA + hostname). Tắt = mở đường MITM.
    rejectUnauthorized: true,
    // = CN của chứng chỉ; broker cũng ép client id = CN (use_username_as_clientid)
    clientId: clientName,
    clean: true,
    reconnectPeriod: 5000,
  });
}
