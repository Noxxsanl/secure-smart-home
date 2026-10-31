// Client MQTT dùng chung của module control (Broker 2, TLS — kiểm chứng chứng chỉ, invariant 3): features/command-ack
// tạo client + subscribe ack và đăng ký vào đây; các feature gửi lệnh/OTA publish qua publishJson.
import type { MqttClient } from "mqtt";

let commandClient: MqttClient | null = null;

export function hasCommandClient(): boolean {
  return commandClient !== null;
}

export function setCommandClient(client: MqttClient): void {
  commandClient = client;
}

export function isCommandBrokerConnected(): boolean {
  return commandClient !== null && commandClient.connected;
}

/** Publish JSON QoS 1. false nếu broker chưa kết nối hoặc publish lỗi (không chờ kết nối lại để khỏi gửi lệnh "trễ"). */
export function publishJson(topic: string, body: Record<string, unknown>): Promise<boolean> {
  const client = commandClient;
  if (!client || !client.connected) return Promise.resolve(false);
  return new Promise<boolean>((resolve) => {
    client.publish(topic, JSON.stringify(body), { qos: 1, retain: false }, (err) => resolve(!err));
  });
}
