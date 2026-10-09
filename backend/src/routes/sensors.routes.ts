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

  // V2 có nhiều nhà, mỗi nhà một gateway: gateway chỉ được nhận secret của node thuộc CHÍNH NÓ
  // (devices.gateway_device_id) cộng các sensor cũ chưa gán gateway (gateway_device_id IS NULL — phần
  // cứng đăng ký qua /api/devices/register, hành vi cũ giữ nguyên). Nếu không lọc, gateway của nhà A
  // lấy được secret của mọi thiết bị nhà B.
  const [rows] = await pool.execute<any[]>(
    `SELECT device_id, secret_key FROM devices
     WHERE device_type = 'sensor' AND status = 'active'
       AND (gateway_device_id IS NULL OR gateway_device_id = ?)`,
    [gwResult.device?.id ?? null]
  );

  res.json({ sensors: rows });
});

export default router;
