// Heartbeat gateway (docs/API_DESIGN.md, MQTT): subscribe Broker MQTT (TLS) topic home/+/gateway/+/heartbeat.
// Gateway gửi mỗi ~30 s; xử lý từng message ở gateway-heartbeat.handler.ts. Broker chưa lên thì mqtt.js tự kết nối lại.
import { connectBroker } from "../../../../infrastructure/mqtt/broker";
import { HEARTBEAT_TOPIC_FILTER } from "../../domain/heartbeat";
import { handleHeartbeat } from "./gateway-heartbeat.handler";

let started = false;

export function startGatewayHeartbeat(): void {
  if (started) return;
  started = true;
  const client = connectBroker("iot-backend-heartbeat");

  client.on("connect", () => {
    console.log("[heartbeat] connected, subscribing to gateway heartbeats");
    client.subscribe(HEARTBEAT_TOPIC_FILTER, { qos: 1 }, (err) => {
      if (err) console.error("[heartbeat] subscribe failed:", err.message);
    });
  });

  client.on("message", (topic: string, payload: Buffer) => {
    handleHeartbeat(topic, payload.toString()).catch((err: unknown) =>
      console.error("[heartbeat] unhandled error:", err instanceof Error ? err.message : "unknown error")
    );
  });

  client.on("error", (err) => {
    console.error("[heartbeat] error:", err.message);
  });
}
