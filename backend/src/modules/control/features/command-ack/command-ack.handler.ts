// Xử lý một message ack lệnh từ thiết bị: home/{homeId}/gateway/{gwUid}/device/{devUid}/command/ack.
// Ack lạ/muộn/sai chữ ký đều bị bỏ qua (CONTRACT §7). Chữ ký ack (hợp đồng A+B §2b) = HMAC-SHA256(secret gateway,
//   "v2|ack|<gw>|<device_uid>|<command_id>|<status>|<power>|<ts>")  — payload có `"v":2`; gw và device_uid lấy từ TOPIC
// (đã bị ép khớp mục đang chờ), power = "1"/"0"/"" (không có trường power). Không có ctr: command_id dùng một lần —
// pending entry bị xoá ngay sau ack hợp lệ đầu tiên nên gói ack bị phát lại không còn gì để resolve.
// Dạng cũ "<command_id>:<status>:<ts>" (không có "v") CHỈ nhận khi DEVICE_HMAC_V1=true, giống telemetry.
// Sai chữ ký → bỏ, audit 1 lần/lệnh, KHÔNG tăng fail_count.
import { env } from "../../../../config/env";
import { logEvent } from "../../../audit";
import { ackMessageV2, isUnixSeconds, isWellFormedUid } from "../../../devices";
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
  if (typeof body !== "object" || body === null || Array.isArray(body)) return;
  const { v, command_id: commandId, status, power, ts, hmac } = body as Record<string, unknown>;
  if (typeof commandId !== "string") return;
  if (v === 2) {
    if (!isWellFormedUid(commandId)) return; // không có `|`/ký tự lạ trong chuỗi ký
  } else if (v !== undefined || !env.deviceHmacV1) {
    return; // dạng cũ bị tắt (mặc định) hoặc phiên bản lạ
  }

  const entry = findPendingAck(commandId);
  if (!entry) return; // ack không biết hoặc đến muộn sau timeout
  // Ack phải đến đúng topic của lệnh đã gửi — chặn ack của thiết bị/nhà khác mạo danh command_id
  if (parts[1] !== String(entry.homeId) || parts[3] !== entry.gatewayUid || parts[5] !== entry.deviceUid) return;

  if ((status !== "ok" && status !== "error") || typeof ts !== "number" || typeof hmac !== "string") return;
  if (Math.abs(Date.now() / 1000 - ts) > TS_WINDOW_SECONDS) return;

  let message: string;
  if (v === 2) {
    // power có mặt thì phải là boolean — sai kiểu mà vẫn ký "" là cách lách chuỗi ký
    if (power !== undefined && typeof power !== "boolean") return;
    if (!isUnixSeconds(ts)) return;
    message = ackMessageV2({
      gatewayId: parts[3],
      deviceUid: parts[5],
      commandId,
      status,
      power: power === undefined ? null : power,
      ts,
    });
  } else {
    message = `${commandId}:${status}:${ts}`;
  }

  if (!entry.signer.verify(message, hmac)) {
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
