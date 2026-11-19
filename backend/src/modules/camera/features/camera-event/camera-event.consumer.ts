// Sự kiện camera từ gateway: subscribe Broker MQTT (TLS) topic home/+/gateway/+/device/+/camera/event.
// Mỗi message xử lý ở camera-event.handler.ts. Broker chưa lên thì mqtt.js tự kết nối lại.
import { connectBroker } from "../../../../infrastructure/mqtt/broker";
import { CAMERA_EVENT_TOPIC_FILTER } from "../../domain/camera-event";
import { handleCameraEvent } from "./camera-event.handler";

let started = false;

export function startCameraEventConsumer(): void {
  if (started) return;
  started = true;
  const client = connectBroker("iot-backend-camera");

  client.on("connect", () => {
    console.log("[cameraEvent] connected, subscribing to camera events");
    client.subscribe(CAMERA_EVENT_TOPIC_FILTER, { qos: 1 }, (err) => {
      if (err) console.error("[cameraEvent] subscribe failed:", err.message);
    });
  });

  client.on("message", (topic: string, payload: Buffer) => {
    handleCameraEvent(topic, payload.toString()).catch((err: unknown) =>
      console.error("[cameraEvent] unhandled error:", err instanceof Error ? err.message : "unknown error")
    );
  });

  client.on("error", (err) => {
    console.error("[cameraEvent] error:", err.message);
  });
}
