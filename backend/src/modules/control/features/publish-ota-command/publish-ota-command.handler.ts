// Phát lệnh OTA tới gateway (CONTRACT §7). Không có route HTTP: module ota gọi qua control.facade.
// Chữ ký = HMAC-SHA256(secret gateway, "<job_id>:<version>:<ts>"); ký qua getGatewaySigner (module devices), control không cầm secret.
import { getDeviceRow, getGatewaySigner } from "../../../devices";
import { gatewayBaseTopic } from "../../domain/command-topics";
import type { PublishOtaCommandInput } from "../../domain/command.types";
import { publishJson } from "../../infrastructure/command-mqtt.client";

/**
 * Phát lệnh OTA tới gateway (CONTRACT §7): `home/{home}/gateway/{uid}/ota/command`. Trả true nếu đã
 * publish, false nếu không thể (gateway chưa gán nhà, broker chưa kết nối…). Không bao giờ ném lỗi;
 * người gọi quyết định đánh dấu ota_history là failed hay chờ. Gateway mô phỏng không cần gọi hàm này.
 */
export async function publishOtaCommand(input: PublishOtaCommandInput): Promise<boolean> {
  try {
    const gateway = await getDeviceRow(input.gatewayId);
    if (!gateway || gateway.device_type !== "gateway" || gateway.home_id === null) return false;
    const signer = await getGatewaySigner(gateway.id);
    if (!signer) return false;
    const ts = Math.floor(Date.now() / 1000);
    return await publishJson(`${gatewayBaseTopic(gateway.home_id, gateway.device_id)}/ota/command`, {
      job_id: input.jobId,
      version: input.version,
      target_type: input.targetType,
      checksum_sha256: input.checksumSha256,
      ts,
      hmac: signer.sign(`${input.jobId}:${input.version}:${ts}`),
    });
  } catch (err) {
    console.error("[commands] publishOtaCommand failed:", err instanceof Error ? err.message : "unknown error");
    return false;
  }
}
