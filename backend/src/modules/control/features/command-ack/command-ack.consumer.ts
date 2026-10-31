// Kết nối Broker 2 (TLS) và subscribe ack lệnh. Gọi 1 lần lúc khởi động (worker commandAckListener trong
// control.module.ts). Broker chưa lên thì mqtt.js tự kết nối lại; trong lúc đó lệnh tới thiết bị thật kết thúc bằng
// TIMEOUT. Cũng dùng chính client này (infrastructure/command-mqtt.client.ts) để publish lệnh/OTA.
import { connectBroker } from "../../../../infrastructure/mqtt/broker";
import { ACK_TOPIC_FILTER } from "../../domain/command-topics";
import { hasCommandClient, setCommandClient } from "../../infrastructure/command-mqtt.client";
import { handleAckMessage } from "./command-ack.handler";

export function startCommandAckListener(): void {
  if (hasCommandClient()) return;
  const client = connectBroker("iot-backend-commands");
  setCommandClient(client);

  client.on("connect", () => {
    console.log("[commands] connected, subscribing to command acks");
    client.subscribe(ACK_TOPIC_FILTER, { qos: 1 }, (err) => {
      if (err) console.error("[commands] subscribe failed:", err.message);
    });
  });
  client.on("message", (topic: string, payload: Buffer) => {
    try {
      handleAckMessage(topic, payload.toString());
    } catch (err) {
      console.error("[commands] failed to handle ack:", err instanceof Error ? err.message : "unknown error");
    }
  });
  client.on("error", (err) => {
    console.error("[commands] error:", err.message);
  });
}
