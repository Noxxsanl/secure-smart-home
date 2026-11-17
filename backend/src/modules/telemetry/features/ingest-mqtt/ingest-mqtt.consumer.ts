// Đường nhận dữ liệu chính: subscribe Broker MQTT (gateway → backend, mTLS) topic gateway/+/data.
// Xử lý từng message ở ingest-mqtt.handler.ts; đường fallback HTTP ở features/ingest-http — cả hai gọi chung
// domain/ingest-auth.ts (invariant 4). Topic được truyền vào handler: gateway_id trong payload phải trùng topic.
import { connectBroker } from "../../../../infrastructure/mqtt/broker";
import { handleGatewayData } from "./ingest-mqtt.handler";

export function startMqttDataService(): void {
  // Tài khoản broker iot-backend-data (CN chứng chỉ client): ACL chỉ cho đọc gateway/+/data
  const client = connectBroker("iot-backend-data");

  client.on("connect", () => {
    console.log("[mqttData] connected, subscribing to gateway/+/data");
    client.subscribe("gateway/+/data", { qos: 1 }, (err) => {
      if (err) console.error("[mqttData] subscribe failed:", err.message);
    });
  });

  client.on("message", (topic: string, payload: Buffer) => {
    handleGatewayData(topic, payload.toString()).catch((err) =>
      console.error("[mqttData] unhandled error:", err instanceof Error ? err.message : "unknown error")
    );
  });

  client.on("error", (err) => {
    console.error("[mqttData] error:", err.message);
  });
}
