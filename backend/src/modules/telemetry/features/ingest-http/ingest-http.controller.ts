import type { Request, Response } from "express";
import { getClientIp, type AuthenticatedHttpTelemetry } from "./ingest-http.dto";
import { ingestHttpData } from "./ingest-http.handler";

// POST /api/device/data — chạy SAU middleware validate-device (gắn req.telemetry: gateway/sensor đã xác thực + số đo).
export async function ingestHttpController(req: Request, res: Response): Promise<void> {
  const telemetry = (req as Request & { telemetry?: AuthenticatedHttpTelemetry }).telemetry;
  if (!telemetry) {
    res.status(401).json({ error: "GATEWAY_AUTH_FAIL" });
    return;
  }
  const result = await ingestHttpData({
    gateway: telemetry.gateway,
    sensor: telemetry.sensor,
    ip: getClientIp(req),
    userAgent: req.headers["user-agent"] ?? null,
    gatewayIp: telemetry.gatewayIp,
    sensorIp: telemetry.sensorIp,
    data: telemetry.data,
    dataJson: telemetry.dataJson,
  });
  res.status(result.status).json(result.body);
}
