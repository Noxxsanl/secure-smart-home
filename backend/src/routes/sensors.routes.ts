import { Router, Request, Response } from "express";
import pool from "../config/db";
import { verifyGatewayHMAC } from "../services/hmacService";

const router = Router();

// GET /api/device/sensors?gateway_id=X&gw_timestamp=Y&gw_hmac=Z
// Gateway gọi endpoint này để lấy danh sách sensor được phép.
// Xác thực bằng Gateway HMAC trước khi trả về credentials.
router.get("/", async (req: Request, res: Response): Promise<void> => {
  const { gateway_id, gw_timestamp, gw_hmac } = req.query as Record<string, string>;

  if (!gateway_id || !gw_timestamp || !gw_hmac) {
    res.status(400).json({ error: "MISSING_GATEWAY_FIELDS" });
    return;
  }

  const gwResult = await verifyGatewayHMAC(gateway_id, Number(gw_timestamp), gw_hmac);
  if (!gwResult.ok) {
    res.status(401).json({ error: "GATEWAY_AUTH_FAIL", reason: gwResult.error });
    return;
  }

  const [rows] = await pool.execute<any[]>(
    `SELECT device_id, secret_key FROM devices WHERE device_type = 'sensor' AND status = 'active'`
  );

  res.json({ sensors: rows });
});

export default router;
