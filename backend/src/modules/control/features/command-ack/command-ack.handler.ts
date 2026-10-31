// Xử lý một message ack lệnh từ thiết bị: home/{homeId}/gateway/{gwUid}/device/{devUid}/command/ack.
// Ack lạ/muộn/sai chữ ký đều bị bỏ qua (CONTRACT §7). Chữ ký ack = HMAC-SHA256(secret gateway, "<command_id>:<status>:<ts>").
import { logEvent } from "../../../audit";
import { findPendingAck } from "../../domain/pending-acks";

const TS_WINDOW_SECONDS = 300; // cùng cửa sổ chống replay với HMAC ingest (devices/domain/hmac.service.ts)

export function handleAckMessage(topic: string, raw: string): void {
  // home/{homeId}/gateway/{gwUid}/device/{devUid}/command/ack
  const parts = topic.split("/");
  if (parts.length !== 8 || parts[0] !== "home" || parts[2] !== "gateway" || parts[4] !== "device" || parts[6] !== "command" || parts[7] !== "ack") {
    return;
  }

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return;
  }
  if (typeof body !== "object" || body === null) return;
  const { command_id: commandId, status, power, ts, hmac } = body as Record<string, unknown>;
  if (typeof commandId !== "string") return;

  const entry = findPendingAck(commandId);
  if (!entry) return; // ack không biết hoặc đến muộn sau timeout
  // Ack phải đến đúng topic của lệnh đã gửi — chặn ack của thiết bị/nhà khác mạo danh command_id
  if (parts[1] !== String(entry.homeId) || parts[3] !== entry.gatewayUid || parts[5] !== entry.deviceUid) return;

  if ((status !== "ok" && status !== "error") || typeof ts !== "number" || typeof hmac !== "string") return;
  if (Math.abs(Date.now() / 1000 - ts) > TS_WINDOW_SECONDS) return;

  if (!entry.signer.verify(`${commandId}:${status}:${ts}`, hmac)) {
    if (!entry.badHmacLogged) {
      entry.badHmacLogged = true; // chỉ log lần đầu mỗi lệnh để kẻ gửi rác không làm ngập log
      void logEvent({
        eventType: "GATEWAY_AUTH_FAIL",
        deviceId: entry.gatewayDbId,
        message: "Ack lệnh có chữ ký HMAC không hợp lệ",
        details: { reason: "ack_hmac_mismatch", source: "mqtt" },
      });
    }
    return;
  }
  entry.resolve({ kind: "ack", status, power: typeof power === "boolean" ? power : null });
}
