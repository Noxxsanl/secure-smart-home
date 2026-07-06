import { Router, Request, Response } from "express";
import pool from "../config/db";
import { verifyJWT } from "../middleware/verifyJWT";

const router = Router();

// GET /api/dashboard/stats
router.get("/stats", verifyJWT, async (_req: Request, res: Response): Promise<void> => {
  const [[counts]] = await pool.execute<any[]>(`
    SELECT
      COALESCE(SUM(device_type = 'gateway'), 0)                                                                        AS total_gateway,
      COALESCE(SUM(device_type = 'sensor'), 0)                                                                         AS total_sensor,
      COALESCE(SUM(device_type = 'gateway' AND last_seen IS NOT NULL AND TIMESTAMPDIFF(SECOND, last_seen, NOW()) < 60), 0) AS gateway_online,
      COALESCE(SUM(device_type = 'sensor'  AND last_seen IS NOT NULL AND TIMESTAMPDIFF(SECOND, last_seen, NOW()) < 60), 0) AS sensor_online
    FROM devices
  `);

  const [[dataCount]] = await pool.execute<any[]>(
    `SELECT COUNT(*) AS total_data_points FROM sensor_data`
  );

  res.json({
    total_gateway: Number(counts.total_gateway),
    total_sensor: Number(counts.total_sensor),
    gateway_online: Number(counts.gateway_online),
    sensor_online: Number(counts.sensor_online),
    total_data_points: Number(dataCount.total_data_points),
  });
});

export default router;
