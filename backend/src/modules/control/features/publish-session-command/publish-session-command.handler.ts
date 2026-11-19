// Lệnh điều khiển PHIÊN (không phải lệnh người dùng) tới một thiết bị qua gateway: vd camera live_start / live_stop.
// Cùng khuôn lệnh relay (send-device-command): topic `home/<home>/gateway/<gw>/device/<dev>/command`, QoS 1, payload
// { command_id, action, ts, hmac } với hmac = HMAC-SHA256(secret gateway, "<command_id>:<device_uid>:<action>:<ts>").
// Khác lệnh relay: KHÔNG ghi device_commands, KHÔNG chờ ack (gateway không ack lệnh phiên) — người gọi tự audit.
// Ký qua getGatewaySigner (secret không rời module devices — invariant 1, 2); chữ ký/command_id không bao giờ được log.
import { getGatewaySigner } from "../../../devices";
import { gatewayBaseTopic } from "../../domain/command-topics";
import type { PublishSessionCommandInput } from "../../domain/command.types";
import { publishJson } from "../../infrastructure/command-mqtt.client";

/** true nếu đã publish; false nếu không thể (không có gateway/secret, broker chưa kết nối…). Không bao giờ ném lỗi. */
export async function publishSessionCommand(input: PublishSessionCommandInput): Promise<boolean> {
  try {
    const signer = await getGatewaySigner(input.gatewayDbId);
    if (!signer) return false;
    const ts = Math.floor(Date.now() / 1000);
    return await publishJson(`${gatewayBaseTopic(input.homeId, input.gatewayUid)}/device/${input.deviceUid}/command`, {
      command_id: input.commandId,
      action: input.action,
      ts,
      hmac: signer.sign(`${input.commandId}:${input.deviceUid}:${input.action}:${ts}`),
    });
  } catch (err) {
    console.error("[commands] publishSessionCommand failed:", err instanceof Error ? err.message : "unknown error");
    return false;
  }
}
