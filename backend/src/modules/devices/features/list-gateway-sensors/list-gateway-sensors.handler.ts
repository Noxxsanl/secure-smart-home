// Danh sách sensor mà một gateway được phép nhận (đường /api/device, HMAC — không có phiên người dùng).
import { verifyGatewayHMAC, type HMACVerifyResult } from "../../domain/hmac.service";
import { listActiveSensorSecrets } from "../../infrastructure/device-secret.repository";

export type ListGatewaySensorsResult =
  | { ok: true; sensors: { device_id: string; secret_key: string }[] }
  | { ok: false; reason: HMACVerifyResult["error"] };

export async function listGatewaySensors(gatewayId: string, timestamp: number, hmac: string): Promise<ListGatewaySensorsResult> {
  const gwResult = await verifyGatewayHMAC(gatewayId, timestamp, hmac);
  if (!gwResult.ok) return { ok: false, reason: gwResult.error };

  // V2 có nhiều nhà, mỗi nhà một gateway: gateway chỉ được nhận secret của node thuộc CHÍNH NÓ
  // (devices.gateway_device_id) cộng các sensor cũ chưa gán gateway (gateway_device_id IS NULL — phần
  // cứng đăng ký qua /api/devices/register, hành vi cũ giữ nguyên). Nếu không lọc, gateway của nhà A
  // lấy được secret của mọi thiết bị nhà B.
  return { ok: true, sensors: await listActiveSensorSecrets(gwResult.device?.id ?? null) };
}
