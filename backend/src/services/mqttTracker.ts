import pool from "../config/db";
import { connectBroker } from "../config/mqtt";

// Mosquitto Notice log: "New client connected from 192.168.100.54:40434 as gw-ESP32-GW-xxx (...)"
// Capture IP and optional :port separately so port can be stripped.
const CONNECT_RE = /New client connected from ([\d.a-fA-F:]+?)(?::\d+)? as (\S+?)\s/;

async function updateDeviceIp(clientId: string, ip: string): Promise<void> {
  try {
    await pool.execute(
      "UPDATE devices SET last_ip = ? WHERE device_id = ?",
      [ip, clientId]
    );
  } catch {
    // never crash the main process
  }
}

export function startMqttTracker(): void {
  // Broker 2 (gateway → backend layer; $SYS logs contain gateway IPs), MQTT over TLS
  const client = connectBroker("iot-backend-tracker");

  client.on("connect", () => {
    console.log("[mqttTracker] connected, subscribing to $SYS logs");
    // Notice-level logs contain "New client connected from <IP> as <clientId>"
    client.subscribe("$SYS/broker/log/N", { qos: 0 });
  });

  client.on("message", (_topic: string, payload: Buffer) => {
    const msg = payload.toString();
    const m = CONNECT_RE.exec(msg);
    if (!m) return;
    const [, ip, rawClientId] = m;
    // ignore the tracker itself
    if (rawClientId === "iot-backend-tracker") return;
    // firmware prefixes client IDs: "gw-ESP32-GW-xxx" / "sn-ESP32-SN-xxx"
    const deviceId = rawClientId.replace(/^(?:gw|sn)-/, "");
    updateDeviceIp(deviceId, ip);
  });

  client.on("error", (err) => {
    console.error("[mqttTracker] error:", err.message);
  });
}
