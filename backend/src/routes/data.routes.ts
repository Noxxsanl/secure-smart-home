// POST /api/device/data – đường fallback HTTP để firmware đẩy dữ liệu lên.
// Đường chính là MQTT (mqttDataService.ts); endpoint này tồn tại để các thiết bị
// không kết nối được tới MQTT broker (ví dụ: khác network segment) vẫn có thể
// gửi dữ liệu qua HTTP thông thường. Cả hai đường đều xác thực HMAC 2 lớp.
import { Router, Request, Response } from "express";
import pool from "../config/db";
import { validateDevice } from "../middleware/validateDevice";
import { log, logDataRecvWithPrune } from "../services/auditLogger";

const router = Router();

function getClientIp(req: Request): string {
  return (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ?? req.socket.remoteAddress ?? "";
}

// POST /api/device/data
router.post("/", validateDevice, async (req: Request, res: Response): Promise<void> => {
  const gateway = (req as any).gateway as { id: number; device_id: string; status: string };
  const sensor = (req as any).sensor as { id: number; device_id: string; status: string };
  const ip = getClientIp(req);
  const userAgent = req.headers["user-agent"] ?? null;

  const { gateway_ip, sensor_payload } = req.body ?? {};
  const { data, sensor_ip } = sensor_payload ?? {};

  if (data === undefined || data === null || typeof data !== "object" || Array.isArray(data)) {
    res.status(400).json({ error: "MISSING_PAYLOAD_DATA", detail: "Request body must include a 'data' object" });
    return;
  }

  // Fetch device_type and current status from DB (single round-trip for both devices)
  const [rows] = await pool.execute<any[]>(
    `SELECT id, device_type, status FROM devices WHERE id IN (?, ?)`,
    [gateway.id, sensor.id]
  );

  const gwRow = (rows as any[]).find((r) => r.id === gateway.id);
  const snRow = (rows as any[]).find((r) => r.id === sensor.id);

  // RBAC: device_type check
  if (!gwRow || gwRow.device_type !== "gateway") {
    await log("PRIVILEGE_ESCALATION", gateway.id, ip, userAgent as string | null, {
      gateway_id: gateway.device_id,
      actual_type: gwRow?.device_type ?? "unknown",
      reason: "device_type_not_gateway",
    });
    res.status(403).json({ error: "INVALID_DEVICE_TYPE", detail: "gateway_id must be a gateway device" });
    return;
  }
  if (!snRow || snRow.device_type !== "sensor") {
    await log("PRIVILEGE_ESCALATION", sensor.id, ip, userAgent as string | null, {
      sensor_id: sensor.device_id,
      actual_type: snRow?.device_type ?? "unknown",
      reason: "device_type_not_sensor",
    });
    res.status(403).json({ error: "INVALID_DEVICE_TYPE", detail: "sensor_id must be a sensor device" });
    return;
  }

  // Status check: both must be active
  if (gwRow.status === "blocked") {
    res.status(403).json({ error: "DEVICE_BLOCKED", detail: "Gateway is blocked" });
    return;
  }
  if (gwRow.status !== "active") {
    res.status(403).json({ error: "DEVICE_NOT_ACTIVE", detail: "Gateway is not active" });
    return;
  }
  if (snRow.status === "blocked") {
    res.status(403).json({ error: "DEVICE_BLOCKED", detail: "Sensor is blocked" });
    return;
  }
  if (snRow.status !== "active") {
    res.status(403).json({ error: "DEVICE_NOT_ACTIVE", detail: "Sensor is not active" });
    return;
  }

  // Insert sensor data
  const [insertResult] = await pool.execute<any>(
    `INSERT INTO sensor_data (device_id, gateway_id, payload) VALUES (?, ?, ?)`,
    [sensor.id, gateway.id, JSON.stringify(data)]
  );

  // Fetch received_at from the newly inserted row
  const [sdRows] = await pool.execute<any[]>(
    `SELECT received_at FROM sensor_data WHERE id = ?`,
    [insertResult.insertId]
  );
  const receivedAt: Date = sdRows[0]?.received_at ?? new Date();

  // Giữ chỉ 150 bản ghi gần nhất cho mỗi sensor
  await pool.execute(
    `DELETE FROM sensor_data WHERE device_id = ? AND id NOT IN (
       SELECT id FROM (SELECT id FROM sensor_data WHERE device_id = ? ORDER BY id DESC LIMIT 150) t
     )`,
    [sensor.id, sensor.id]
  );

  // Dùng IP do firmware tự báo (gateway_ip / sensor_ip trong body).
  // Fallback về HTTP client IP nếu firmware cũ chưa gửi field này.
  const resolvedGwIp  = (typeof gateway_ip === "string" && gateway_ip) ? gateway_ip : ip;
  const resolvedSnIp  = (typeof sensor_ip  === "string" && sensor_ip)  ? sensor_ip  : null;

  await pool.execute(
    `UPDATE devices SET last_seen = NOW(), fail_count = 0, last_ip = ? WHERE id = ?`,
    [resolvedGwIp, gateway.id]
  );
  if (resolvedSnIp) {
    await pool.execute(
      `UPDATE devices SET last_seen = NOW(), fail_count = 0, last_ip = ? WHERE id = ?`,
      [resolvedSnIp, sensor.id]
    );
  } else {
    await pool.execute(
      `UPDATE devices SET last_seen = NOW(), fail_count = 0 WHERE id = ?`,
      [sensor.id]
    );
  }

  // Audit log
  await logDataRecvWithPrune(sensor.id, ip, userAgent as string | null, {
    gateway_id: gateway.device_id,
    sensor_id: sensor.device_id,
    data_id: insertResult.insertId,
  });

  res.status(200).json({
    success: true,
    sensor_id: sensor.device_id,
    gateway_id: gateway.device_id,
    received_at: receivedAt,
  });
});

export default router;
