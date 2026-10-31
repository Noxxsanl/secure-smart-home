import type { Request, Response } from "express";
import { getClientIp, type IngestHttpDevice } from "./ingest-http.dto";
import { ingestHttpData } from "./ingest-http.handler";

// POST /api/device/data — chạy SAU middleware validate-device (gắn req.gateway / req.sensor đã xác thực HMAC).
export async function ingestHttpController(req: Request, res: Response): Promise<void> {
  const gateway = (req as any).gateway as IngestHttpDevice;
  const sensor = (req as any).sensor as IngestHttpDevice;

  const { gateway_ip, sensor_payload } = req.body ?? {};
  const { data, sensor_ip } = sensor_payload ?? {};

  const result = await ingestHttpData({
    gateway,
    sensor,
    ip: getClientIp(req),
    userAgent: req.headers["user-agent"] ?? null,
    gatewayIp: gateway_ip,
    sensorIp: sensor_ip,
    data,
  });
  res.status(result.status).json(result.body);
}
