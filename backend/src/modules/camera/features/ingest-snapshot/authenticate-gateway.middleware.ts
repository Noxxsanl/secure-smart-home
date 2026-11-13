// Xác thực gateway cho POST /api/device/camera/snapshot, tách 2 middleware vì chữ ký GẮN VỚI NỘI DUNG ẢNH
// (sha256 của body nằm trong chuỗi ký — xem buildSnapshotSigningString) nên phải có body mới kiểm được HMAC:
//   1. precheckSnapshotRequest — TRƯỚC khi đọc body (không buffer 200 KB cho kẻ chưa qua các kiểm rẻ):
//        header đủ + đúng định dạng → gateway tồn tại (401 NOT_FOUND) → ts trong ±300 s (401 TIMESTAMP_EXPIRED)
//        → device_type gateway (403) + active (403) → camera thuộc gateway (404) + active (403).
//   2. express.raw (≤ 204800 byte, vượt → 413) — gắn ở camera.module.ts.
//   3. verifySnapshotSignature — kiểm HMAC bằng getGatewaySigner (secret không rời module devices, invariant 1, 2).
// Các bước kiểm + xử lý lỗi xác thực (gateway lạ, ts quá hạn, HMAC sai → audit authFailureEventType, registerAuthFailure,
// khoá gateway sau 5 lần sai, 401 GATEWAY_AUTH_FAIL) nằm ở camera/domain/gateway-auth.ts, DÙNG CHUNG với uplink WebSocket
// camera live (invariant 4: một logic xác thực). Không còn dùng verifyGatewayHMAC (chuỗi ngắn "<gw>:<ts>") cho route này.
// Không log chữ ký/secret.
import type { NextFunction, Request, Response } from "express";
import { requestMeta } from "../../../../core/http/request-meta";
import { HttpError } from "../../../../shared/errors/http-error";
import { precheckGatewayCamera, verifyGatewaySignature } from "../../domain/gateway-auth";
import {
  buildSnapshotSigningString,
  parseSnapshotHeaders,
  type PendingSnapshotAuth,
  type VerifiedSnapshotRequest,
} from "./ingest-snapshot.dto";

export const VERIFIED_LOCAL = "verifiedSnapshot";
const PENDING_LOCAL = "pendingSnapshotAuth";
const AUTH_SOURCE = "http_snapshot";

export async function precheckSnapshotRequest(req: Request, res: Response, next: NextFunction): Promise<void> {
  const headers = parseSnapshotHeaders(req);

  const { gateway, camera } = await precheckGatewayCamera(
    requestMeta(req),
    AUTH_SOURCE,
    headers.gatewayUid,
    headers.cameraUid,
    headers.timestamp
  );

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

  await verifyGatewaySignature(
    requestMeta(req),
    AUTH_SOURCE,
    headers.gatewayUid,
    gatewayDbId,
    buildSnapshotSigningString(headers, body),
    headers.signature
  );

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
