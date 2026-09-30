// Kết nối Broker 2 (gateway → backend) bằng MQTT over TLS — FR-12.3, NFR-S1.
// mqttDataService và mqttTracker dùng chung hàm này để luôn cùng cấu hình TLS.
import fs from "fs";
import path from "path";
import mqtt, { MqttClient } from "mqtt";

const host = process.env.MQTT_HOST || "localhost";
const port = Number(process.env.MQTT_PORT) || 8883;
// Mặc định trỏ tới CA do scripts/gen_mqtt_certs.sh sinh, khi chạy backend từ thư mục backend/
const caFile = path.resolve(process.env.MQTT_CA_FILE || "../mosquitto/certs/ca.crt");

function loadCa(file: string): Buffer {
  try {
    return fs.readFileSync(file);
  } catch {
    console.error(
      `[startup] Cannot read MQTT CA certificate at ${file} – run scripts/gen_mqtt_certs.sh or set MQTT_CA_FILE`
    );
    process.exit(1);
  }
}

// Đọc ngay khi load module (giống config/env.ts) để thiếu CA thì dừng lúc khởi động
const ca = loadCa(caFile);

export function connectBroker(clientId: string): MqttClient {
  return mqtt.connect(`mqtts://${host}:${port}`, {
    ca,
    // Luôn kiểm chứng chứng chỉ broker (chữ ký CA + hostname). Tắt = mở đường MITM.
    rejectUnauthorized: true,
    clientId,
    clean: true,
    reconnectPeriod: 5000,
  });
}
