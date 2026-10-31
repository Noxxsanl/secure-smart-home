import type { Request, Response } from "express";
import { listGatewaySensors } from "./list-gateway-sensors.handler";

// GET /api/device/sensors?gateway_id=X&gw_timestamp=Y&gw_hmac=Z
// Gateway gọi endpoint này để lấy danh sách sensor được phép.
// Xác thực bằng Gateway HMAC trước khi trả về credentials.
export async function listGatewaySensorsController(req: Request, res: Response): Promise<void> {
  const { gateway_id, gw_timestamp, gw_hmac } = req.query as Record<string, string>;

  if (!gateway_id || !gw_timestamp || !gw_hmac) {
    res.status(400).json({ error: "MISSING_GATEWAY_FIELDS" });
    return;
  }

  const result = await listGatewaySensors(gateway_id, Number(gw_timestamp), gw_hmac);
  if (!result.ok) {
    res.status(401).json({ error: "GATEWAY_AUTH_FAIL", reason: result.reason });
    return;
  }

  res.json({ sensors: result.sensors });
}
