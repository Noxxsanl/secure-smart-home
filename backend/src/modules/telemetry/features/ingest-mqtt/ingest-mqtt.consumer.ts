// Đường nhận dữ liệu chính: subscribe Broker 2 (gateway → backend, MQTT over TLS) topic gateway/+/data.
// Xử lý từng message ở ingest-mqtt.handler.ts; đường fallback HTTP ở features/ingest-http — hai đường phải luôn
// đồng bộ logic xác thực khi có thay đổi.
import { connectBroker } from "../../../../infrastructure/mqtt/broker";
import { handleGatewayData } from "./ingest-mqtt.handler";

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
