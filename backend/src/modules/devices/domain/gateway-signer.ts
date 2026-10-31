// Ký / kiểm chữ ký HMAC-SHA256 bằng secret của GATEWAY (lệnh relay, lệnh gateway, OTA, ack lệnh — API_DESIGN §3).
// Module khác (control) chỉ nhận đối tượng có sign/verify; secret_key nằm trong closure, không bao giờ rời module
// devices dưới dạng giá trị (invariant 1, 2). Đối tượng chỉ sống trong RAM tới khi ack về / hết 5 s.
import { hmacHex, safeEqualHex } from "../../../shared/crypto";
import { loadGatewaySecret } from "../infrastructure/device-secret.repository";

export interface GatewaySigner {
  /** HMAC-SHA256(secret gateway, message) dạng hex thường. */
  sign(message: string): string;
  /** So chữ ký nhận được với HMAC của message, không rò rỉ thời gian. */
  verify(message: string, hmac: string): boolean;
}

/** null khi không có gateway với id đó (devices.id, device_type = 'gateway'). */
export async function getGatewaySigner(gatewayDbId: number): Promise<GatewaySigner | null> {
  const secret = await loadGatewaySecret(gatewayDbId);
  if (!secret) return null;
  return {
    sign: (message) => hmacHex(secret, message),
    verify: (message, hmac) => safeEqualHex(hmacHex(secret, message), hmac),
  };
}
