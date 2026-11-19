// Kiểu + parse header của POST /api/device/camera/snapshot (device channel, HMAC gateway gắn với nội dung ảnh).
import crypto from "crypto";
import type { Request } from "express";
import { HttpError } from "../../../../shared/errors/http-error";
import { isWellFormedUid } from "../../../devices";
import type { DeviceRow } from "../../../devices";
import { SNAPSHOT_TRIGGERS, type SnapshotTrigger } from "../../domain/camera.types";

const COMMAND_ID_PATTERN = /^[A-Za-z0-9_.:-]{1,64}$/;

/** Kết quả xác thực của middleware, để controller/handler dùng (không chứa secret). */
export interface VerifiedSnapshotRequest {
  gatewayDbId: number;
  gatewayUid: string;
  camera: DeviceRow;
  trigger: SnapshotTrigger;
  commandId: string | null;
  capturedAt: Date;
}

export interface SnapshotHeaders {
  gatewayUid: string;
  timestamp: number;
  signature: string;
  cameraUid: string;
  trigger: SnapshotTrigger;
  commandId: string | null;
}

/** Kết quả kiểm "rẻ" trước khi đọc body: đủ thông tin để kiểm HMAC sau khi có body. */
export interface PendingSnapshotAuth {
  headers: SnapshotHeaders;
  gatewayDbId: number;
  camera: DeviceRow;
}

function header(req: Request, name: string): string | undefined {
  const value = req.get(name);
  return value === undefined || value === "" ? undefined : value;
}

/**
 * Đọc + kiểm hình dạng header; thiếu → 400 MISSING_GATEWAY_FIELDS / MISSING_FIELDS, sai định dạng → 400 INVALID_INPUT.
 * X-Gateway-Id / X-Device-Id phải khớp mẫu UID chặt (chúng được ghi vào audit/log nên không được chứa xuống dòng).
 */
export function parseSnapshotHeaders(req: Request): SnapshotHeaders {
  const gatewayUid = header(req, "x-gateway-id");
  const timestamp = header(req, "x-timestamp");
  const signature = header(req, "x-signature");
  if (gatewayUid === undefined || timestamp === undefined || signature === undefined) {
    throw new HttpError(400, "MISSING_GATEWAY_FIELDS", "X-Gateway-Id, X-Timestamp and X-Signature are required");
  }
  const cameraUid = header(req, "x-device-id");
  const triggerRaw = header(req, "x-trigger");
  if (cameraUid === undefined || triggerRaw === undefined) {
    throw new HttpError(400, "MISSING_FIELDS", "X-Device-Id and X-Trigger are required");
  }
  if (!isWellFormedUid(gatewayUid) || !isWellFormedUid(cameraUid) || !/^\d{1,12}$/.test(timestamp)) {
    throw new HttpError(400, "INVALID_INPUT", "Malformed identity headers");
  }
  if (!(SNAPSHOT_TRIGGERS as readonly string[]).includes(triggerRaw)) {
    throw new HttpError(400, "INVALID_INPUT", "X-Trigger must be motion or request");
  }
  const commandId = header(req, "x-command-id");
  if (commandId !== undefined && !COMMAND_ID_PATTERN.test(commandId)) {
    throw new HttpError(400, "INVALID_INPUT", "X-Command-Id has an invalid format");
  }
  return {
    gatewayUid,
    timestamp: Number(timestamp),
    signature,
    cameraUid,
    trigger: triggerRaw as SnapshotTrigger,
    commandId: commandId ?? null,
  };
}

/**
 * Chuỗi ký của ảnh (gắn chữ ký với nội dung): "<gateway_id>:<ts>:<device_id>:<trigger>:<command_id>:<sha256_hex(body)>".
 * <command_id> là chuỗi rỗng khi không có X-Command-Id (hai dấu ':' liền nhau). sha256 hex thường của đúng các byte body.
 */
export function buildSnapshotSigningString(headers: SnapshotHeaders, body: Buffer): string {
  const bodyHash = crypto.createHash("sha256").update(body).digest("hex");
  return [
    headers.gatewayUid,
    String(headers.timestamp),
    headers.cameraUid,
    headers.trigger,
    headers.commandId ?? "",
    bodyHash,
  ].join(":");
}
