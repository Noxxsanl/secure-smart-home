// Middleware Express thực thi xác thực HMAC 2 lớp cho các endpoint thiết bị.
// Lớp 1 xác minh chữ ký của gateway; Lớp 2 xác minh chữ ký của sensor.
// Nếu một trong hai lớp thất bại, fail_count của thiết bị đó sẽ tăng lên và
// tự động bị khóa khi đạt ngưỡng (registerAuthFailure của module devices — cùng chính sách với đường MQTT).
import { NextFunction, Request, Response } from "express";
import { log } from "../../../audit";
import { isSafeDeviceId, registerAuthFailure, verifyDeviceHMAC, verifyGatewayHMAC } from "../../../devices";
import { authFailureEventType } from "../../domain/ingest-common";
import { getClientIp } from "./ingest-http.dto";

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
  // isSafeDeviceId: id không phải chuỗi hoặc chứa NUL = payload sai (PostgreSQL sẽ lỗi 22021 → 500 nếu để xuống DB).
  if (!isSafeDeviceId(gateway_id) || !gw_timestamp || !gw_hmac) {
    res.status(400).json({ error: "MISSING_GATEWAY_FIELDS" });
    return;
  }

  const gwResult = await verifyGatewayHMAC(gateway_id, Number(gw_timestamp), gw_hmac);

  if (!gwResult.ok) {
    const gwDevice = gwResult.device;
    const deviceDbId = gwDevice?.id ?? null;

    const gwEventType = authFailureEventType("gateway", gwResult.error);
    await log(gwEventType, deviceDbId, ip, userAgent, {
      gateway_id,
      reason: gwResult.error,
    });

    if (deviceDbId) {
      const failure = await registerAuthFailure(deviceDbId);
      if (failure.blocked) {
        await log("DEVICE_BLOCKED", deviceDbId, ip, userAgent, { gateway_id, fail_count: failure.failCount });
      }
    }

    res.status(401).json({ error: "GATEWAY_AUTH_FAIL", reason: gwResult.error });
    return;
  }

  // ── Level 2: Sensor HMAC ───────────────────────────────────────────────────
  if (!sensor_payload || !isSafeDeviceId(sensor_id) || !sn_timestamp || !sn_hmac) {
    res.status(400).json({ error: "MISSING_SENSOR_FIELDS" });
    return;
  }

  const snResult = await verifyDeviceHMAC(sensor_id, Number(sn_timestamp), sn_hmac);

  if (!snResult.ok) {
    const snDevice = snResult.device;
    const deviceDbId = snDevice?.id ?? null;

    const snEventType = authFailureEventType("sensor", snResult.error);
    await log(snEventType, deviceDbId, ip, userAgent, {
      sensor_id,
      reason: snResult.error,
    });

    if (deviceDbId) {
      const failure = await registerAuthFailure(deviceDbId);
      if (failure.blocked) {
        await log("DEVICE_BLOCKED", deviceDbId, ip, userAgent, { sensor_id, fail_count: failure.failCount });
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
