// Xác thực gateway DÙNG CHUNG cho mọi đường camera do gateway gọi (ảnh chụp HTTP và uplink WebSocket camera live) —
// tinh thần bất biến 4: một logic xác thực, không chép vào từng đường. Cùng đường với telemetry: audit
// authFailureEventType (ts quá hạn = REPLAY_ATTACK), registerAuthFailure → đủ 5 lần sai thì gateway bị khoá.
//
// Thứ tự kiểm "rẻ" (precheckGatewayCamera), chưa cần chữ ký:
//   gateway tồn tại (401 NOT_FOUND) → ts trong ±300 s (401 TIMESTAMP_EXPIRED) → device_type gateway (403) + active (403)
//   → camera thuộc gateway, category camera (404) + active (403).
// Sau đó người gọi tự dựng chuỗi cần ký (mỗi đường một chuỗi) và gọi verifyGatewaySignature (401 HMAC_MISMATCH).
// Lỗi ném HttpError: đường HTTP để error filter trả JSON, đường WebSocket đổi thành phản hồi HTTP thô trước upgrade.
// Không log chữ ký/secret (invariant 2).
import type { RequestMeta } from "../../../core/http/request-meta";
import { HttpError } from "../../../shared/errors/http-error";
import { log } from "../../audit";
import { getDeviceRowByUid, getGatewaySigner, isTimestampValid, registerAuthFailure } from "../../devices";
import type { DeviceRow } from "../../devices";
import { authFailureEventType } from "../../telemetry";

export type GatewayAuthFailureReason = "NOT_FOUND" | "TIMESTAMP_EXPIRED" | "HMAC_MISMATCH";

/** Audit + đếm lần sai + 401 GATEWAY_AUTH_FAIL (luôn ném). gatewayDbId null khi gateway không tồn tại. */
export async function failGatewayAuth(
  meta: RequestMeta,
  source: string,
  gatewayUid: string,
  gatewayDbId: number | null,
  reason: GatewayAuthFailureReason
): Promise<never> {
  await log(authFailureEventType("gateway", reason), gatewayDbId, meta.ip, meta.userAgent, {
    gateway_id: gatewayUid,
    reason,
    source,
  });
  if (gatewayDbId !== null) {
    const failure = await registerAuthFailure(gatewayDbId);
    if (failure.blocked) {
      await log("DEVICE_BLOCKED", gatewayDbId, meta.ip, meta.userAgent, {
        gateway_id: gatewayUid,
        fail_count: failure.failCount,
      });
    }
  }
  throw new HttpError(401, "GATEWAY_AUTH_FAIL", undefined, { reason });
}

/** Các kiểm trước chữ ký (xem đầu file). Trả gateway + camera đã nạp. */
export async function precheckGatewayCamera(
  meta: RequestMeta,
  source: string,
  gatewayUid: string,
  cameraUid: string,
  timestamp: number
): Promise<{ gateway: DeviceRow; camera: DeviceRow }> {
  const gateway = await getDeviceRowByUid(gatewayUid);
  if (!gateway) return failGatewayAuth(meta, source, gatewayUid, null, "NOT_FOUND");
  if (!isTimestampValid(timestamp)) return failGatewayAuth(meta, source, gatewayUid, gateway.id, "TIMESTAMP_EXPIRED");

  if (gateway.device_type !== "gateway") {
    throw new HttpError(403, "INVALID_DEVICE_TYPE", "X-Gateway-Id must be a gateway device");
  }
  if (gateway.status === "blocked") throw new HttpError(403, "DEVICE_BLOCKED", "Gateway is blocked");
  if (gateway.status !== "active") throw new HttpError(403, "DEVICE_NOT_ACTIVE", "Gateway is not active");

  const camera = await getDeviceRowByUid(cameraUid);
  if (!camera || camera.category !== "camera" || camera.gateway_device_id !== gateway.id) {
    throw new HttpError(404, "CAMERA_NOT_FOUND", "Camera not found for this gateway");
  }
  if (camera.status !== "active") throw new HttpError(403, "DEVICE_INACTIVE", "Camera is not active");
  return { gateway, camera };
}

/** Kiểm HMAC của `message` bằng secret gateway (getGatewaySigner — secret không rời module devices). Sai → failGatewayAuth. */
export async function verifyGatewaySignature(
  meta: RequestMeta,
  source: string,
  gatewayUid: string,
  gatewayDbId: number,
  message: string,
  signature: string
): Promise<void> {
  const signer = await getGatewaySigner(gatewayDbId);
  if (!signer) return failGatewayAuth(meta, source, gatewayUid, gatewayDbId, "NOT_FOUND");
  if (!signer.verify(message, signature)) {
    return failGatewayAuth(meta, source, gatewayUid, gatewayDbId, "HMAC_MISMATCH");
  }
}
