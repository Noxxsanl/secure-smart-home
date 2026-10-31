// Kiểu input/response + parse request của đường ingest HTTP fallback (POST /api/device/data).
import type { Request } from "express";

/**
 * IP client cho audit + devices.last_ip: req.ip theo `trust proxy` (env TRUST_PROXY) — giống core/http/request-meta,
 * nên khi không đứng sau proxy tin cậy, thiết bị/kẻ tấn công không giả được IP bằng header X-Forwarded-For.
 * Giữ kiểu string (chuỗi rỗng khi không xác định) như đường ingest cũ; cắt 45 ký tự cho cột VARCHAR(45).
 */
export function getClientIp(req: Request): string {
  return (req.ip || req.socket.remoteAddress || "").slice(0, 45);
}

/** Thiết bị đã được middleware validate-device xác thực (xem VerifiedDevice của module devices — không có secret). */
export interface IngestHttpDevice {
  id: number;
  device_id: string;
  status: string;
}

export interface IngestHttpInput {
  gateway: IngestHttpDevice;
  sensor: IngestHttpDevice;
  /** IP của client HTTP (req.ip theo trust proxy). */
  ip: string;
  userAgent: string | null;
  /** body.gateway_ip / body.sensor_payload.sensor_ip do firmware tự báo (kiểu chưa kiểm). */
  gatewayIp: unknown;
  sensorIp: unknown;
  /** body.sensor_payload.data (kiểu chưa kiểm). */
  data: unknown;
}

/** Kết quả để controller gửi nguyên vẹn: mọi mã/shape lỗi của đường HTTP giữ như bản cũ. */
export interface IngestHttpResult {
  status: number;
  body: Record<string, unknown>;
}
