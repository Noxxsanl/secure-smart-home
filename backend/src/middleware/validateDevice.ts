// Middleware Express thực thi xác thực HMAC 2 lớp cho các endpoint thiết bị.
// Lớp 1 xác minh chữ ký của gateway; Lớp 2 xác minh chữ ký của sensor.
// Nếu một trong hai lớp thất bại, fail_count của thiết bị đó sẽ tăng lên và
// tự động bị khóa khi đạt ngưỡng.
import { NextFunction, Request, Response } from "express";
import pool from "../config/db";
import { log } from "../services/auditLogger";
import { verifyDeviceHMAC, verifyGatewayHMAC } from "../services/hmacService";

// Phải khớp với BLOCK_THRESHOLD trong mqttDataService.ts – cả hai đường đều dùng cùng giá trị.
const BLOCK_THRESHOLD = 5;

async function incrementFailCount(deviceDbId: number): Promise<number> {
  await pool.execute(
    `UPDATE devices SET fail_count = fail_count + 1 WHERE id = ?`,
    [deviceDbId]
  );
  const [rows] = await pool.execute<any[]>(
    `SELECT fail_count FROM devices WHERE id = ?`,
    [deviceDbId]
  );
  return rows[0]?.fail_count ?? 0;
}

async function blockDevice(deviceDbId: number): Promise<void> {
  await pool.execute(
    `UPDATE devices SET status = 'blocked' WHERE id = ?`,
    [deviceDbId]
  );
}

function getClientIp(req: Request): string {
  return (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ?? req.socket.remoteAddress ?? "";
}

export async function validateDevice(req: Request, res: Response, next: NextFunction): Promise<void> {
  const ip = getClientIp(req);
  const userAgent = req.headers["user-agent"] ?? null;

  const {
    gateway_id,
    gw_timestamp,
    gw_hmac,
    sensor_payload,
  } = req.body ?? {};

  const sensor_id    = sensor_payload?.sensor_id;
  const sn_timestamp = sensor_payload?.sn_timestamp;
  const sn_hmac      = sensor_payload?.sn_hmac;

  // ── Level 1: Gateway HMAC ──────────────────────────────────────────────────
  if (!gateway_id || !gw_timestamp || !gw_hmac) {
    res.status(400).json({ error: "MISSING_GATEWAY_FIELDS" });
    return;
  }

  const gwResult = await verifyGatewayHMAC(gateway_id, Number(gw_timestamp), gw_hmac);

  if (!gwResult.ok) {
    const gwDevice = gwResult.device;
    const deviceDbId = gwDevice?.id ?? null;

    const gwEventType = gwResult.error === "TIMESTAMP_EXPIRED" ? "REPLAY_ATTACK" : "GATEWAY_AUTH_FAIL";
    await log(gwEventType, deviceDbId, ip, userAgent, {
      gateway_id,
      reason: gwResult.error,
    });

    if (deviceDbId) {
      const newCount = await incrementFailCount(deviceDbId);
      if (newCount >= BLOCK_THRESHOLD) {
        await blockDevice(deviceDbId);
        await log("DEVICE_BLOCKED", deviceDbId, ip, userAgent, { gateway_id, fail_count: newCount });
      }
    }

    res.status(401).json({ error: "GATEWAY_AUTH_FAIL", reason: gwResult.error });
    return;
  }

  // ── Level 2: Sensor HMAC ───────────────────────────────────────────────────
  if (!sensor_payload || !sensor_id || !sn_timestamp || !sn_hmac) {
    res.status(400).json({ error: "MISSING_SENSOR_FIELDS" });
    return;
  }

  const snResult = await verifyDeviceHMAC(sensor_id, Number(sn_timestamp), sn_hmac);

  if (!snResult.ok) {
    const snDevice = snResult.device;
    const deviceDbId = snDevice?.id ?? null;

    const snEventType = snResult.error === "TIMESTAMP_EXPIRED" ? "REPLAY_ATTACK" : "SENSOR_AUTH_FAIL";
    await log(snEventType, deviceDbId, ip, userAgent, {
      sensor_id,
      reason: snResult.error,
    });

    if (deviceDbId) {
      const newCount = await incrementFailCount(deviceDbId);
      if (newCount >= BLOCK_THRESHOLD) {
        await blockDevice(deviceDbId);
        await log("DEVICE_BLOCKED", deviceDbId, ip, userAgent, { sensor_id, fail_count: newCount });
      }
    }

    res.status(401).json({ error: "SENSOR_AUTH_FAIL", reason: snResult.error });
    return;
  }

  // Attach verified device info for downstream handlers
  (req as any).gateway = gwResult.device;
  (req as any).sensor = snResult.device;

  next();
}
