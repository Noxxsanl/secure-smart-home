// Xác thực gateway cho POST /api/device/camera/snapshot, tách 2 middleware vì chữ ký GẮN VỚI NỘI DUNG ẢNH
// (sha256 của body nằm trong chuỗi ký — xem buildSnapshotSigningString) nên phải có body mới kiểm được HMAC:
//   1. precheckSnapshotRequest — TRƯỚC khi đọc body (không buffer 200 KB cho kẻ chưa qua các kiểm rẻ):
//        header đủ + đúng định dạng → gateway tồn tại (401 NOT_FOUND) → ts trong ±300 s (401 TIMESTAMP_EXPIRED)
//        → device_type gateway (403) + active (403) → camera thuộc gateway (404) + active (403).
//   2. express.raw (≤ 204800 byte, vượt → 413) — gắn ở camera.module.ts.
//   3. verifySnapshotSignature — kiểm HMAC bằng getGatewaySigner (secret không rời module devices, invariant 1, 2).
// Lỗi xác thực (gateway lạ, ts quá hạn, HMAC sai) cùng đường với telemetry (invariant 4): audit authFailureEventType
// (ts quá hạn = REPLAY_ATTACK), registerAuthFailure → đủ 5 lần sai thì gateway bị khoá, trả 401 GATEWAY_AUTH_FAIL.
// Không còn dùng verifyGatewayHMAC (chuỗi ngắn "<gw>:<ts>") cho route này. Không log chữ ký/secret.
import type { NextFunction, Request, Response } from "express";
import { requestMeta } from "../../../../core/http/request-meta";
import { HttpError } from "../../../../shared/errors/http-error";
import { log } from "../../../audit";
import { getDeviceRowByUid, getGatewaySigner, isTimestampValid, registerAuthFailure } from "../../../devices";
import { authFailureEventType } from "../../../telemetry";
import {
  buildSnapshotSigningString,
  parseSnapshotHeaders,
  type PendingSnapshotAuth,
  type SnapshotHeaders,
  type VerifiedSnapshotRequest,
} from "./ingest-snapshot.dto";

export const VERIFIED_LOCAL = "verifiedSnapshot";
const PENDING_LOCAL = "pendingSnapshotAuth";

type AuthFailureReason = "NOT_FOUND" | "TIMESTAMP_EXPIRED" | "HMAC_MISMATCH";

/** Audit + đếm lần sai + 401 GATEWAY_AUTH_FAIL (luôn ném). gatewayDbId null khi gateway không tồn tại. */
async function failAuth(
  req: Request,
  headers: SnapshotHeaders,
  gatewayDbId: number | null,
  reason: AuthFailureReason
): Promise<never> {
  const { ip, userAgent } = requestMeta(req);
  await log(authFailureEventType("gateway", reason), gatewayDbId, ip, userAgent, {
    gateway_id: headers.gatewayUid,
    reason,
    source: "http_snapshot",
  });
  if (gatewayDbId !== null) {
    const failure = await registerAuthFailure(gatewayDbId);
    if (failure.blocked) {
      await log("DEVICE_BLOCKED", gatewayDbId, ip, userAgent, {
        gateway_id: headers.gatewayUid,
        fail_count: failure.failCount,
      });
    }
  }
  throw new HttpError(401, "GATEWAY_AUTH_FAIL", undefined, { reason });
}

export async function precheckSnapshotRequest(req: Request, res: Response, next: NextFunction): Promise<void> {
  const headers = parseSnapshotHeaders(req);

  const gateway = await getDeviceRowByUid(headers.gatewayUid);
  if (!gateway) return failAuth(req, headers, null, "NOT_FOUND");
  if (!isTimestampValid(headers.timestamp)) return failAuth(req, headers, gateway.id, "TIMESTAMP_EXPIRED");

  if (gateway.device_type !== "gateway") {
    throw new HttpError(403, "INVALID_DEVICE_TYPE", "X-Gateway-Id must be a gateway device");
  }
  if (gateway.status === "blocked") throw new HttpError(403, "DEVICE_BLOCKED", "Gateway is blocked");
  if (gateway.status !== "active") throw new HttpError(403, "DEVICE_NOT_ACTIVE", "Gateway is not active");

  const camera = await getDeviceRowByUid(headers.cameraUid);
  if (!camera || camera.category !== "camera" || camera.gateway_device_id !== gateway.id) {
    throw new HttpError(404, "CAMERA_NOT_FOUND", "Camera not found for this gateway");
  }
  if (camera.status !== "active") throw new HttpError(403, "DEVICE_INACTIVE", "Camera is not active");

  const pending: PendingSnapshotAuth = { headers, gatewayDbId: gateway.id, camera };
  res.locals[PENDING_LOCAL] = pending;
  next();
}

export async function verifySnapshotSignature(req: Request, res: Response, next: NextFunction): Promise<void> {
  const { headers, gatewayDbId, camera } = res.locals[PENDING_LOCAL] as PendingSnapshotAuth;

  // express.raw chỉ giải mã Content-Type image/jpeg; loại khác → req.body không phải Buffer, không có gì để băm
  const body: unknown = req.body;
  if (!Buffer.isBuffer(body)) {
    throw new HttpError(400, "INVALID_IMAGE", "Body must be a JPEG image (Content-Type: image/jpeg)");
  }

  const signer = await getGatewaySigner(gatewayDbId);
  if (!signer) return failAuth(req, headers, gatewayDbId, "NOT_FOUND");
  if (!signer.verify(buildSnapshotSigningString(headers, body), headers.signature)) {
    return failAuth(req, headers, gatewayDbId, "HMAC_MISMATCH");
  }

  const verified: VerifiedSnapshotRequest = {
    gatewayDbId,
    gatewayUid: headers.gatewayUid,
    camera,
    trigger: headers.trigger,
    commandId: headers.commandId,
    capturedAt: new Date(headers.timestamp * 1000),
  };
  res.locals[VERIFIED_LOCAL] = verified;
  next();
}
