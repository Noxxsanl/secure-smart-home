import { Router, Request, Response } from "express";
import pool from "../config/db";
import { verifyJWT } from "../middleware/verifyJWT";
import { requireRole } from "../middleware/rbac";

const router = Router();

const VALID_EVENT_TYPES = [
  "GATEWAY_AUTH_FAIL",
  "SENSOR_AUTH_FAIL",
  "REPLAY_ATTACK",
  "PRIVILEGE_ESCALATION",
  "DATA_RECV",
  "DEVICE_REGISTER",
  "DEVICE_BLOCKED",
  "DEVICE_STATUS_CHANGE",
  "DEVICE_DELETE",
];

// Lọc log theo role: operator thấy sự kiện vận hành và bảo mật,
// admin thấy tất cả bao gồm DEVICE_DELETE (có thể lộ ID thiết bị đã xóa).
const ALLOWED_EVENT_TYPES_BY_ROLE: Record<string, string[]> = {
  admin: VALID_EVENT_TYPES,
  operator: ["GATEWAY_AUTH_FAIL", "SENSOR_AUTH_FAIL", "REPLAY_ATTACK", "PRIVILEGE_ESCALATION", "DATA_RECV", "DEVICE_REGISTER", "DEVICE_BLOCKED", "DEVICE_STATUS_CHANGE"],
};

// DELETE /api/audit-log/by-type?event_type=XXX – xóa toàn bộ log theo loại (admin only)
router.delete("/by-type", verifyJWT, requireRole("admin"), async (req: Request, res: Response): Promise<void> => {
  const { event_type } = req.query;
  if (!event_type || typeof event_type !== "string" || !VALID_EVENT_TYPES.includes(event_type)) {
    res.status(400).json({ error: "INVALID_EVENT_TYPE" });
    return;
  }
  const [result] = await (pool as any).execute(
    "DELETE FROM audit_log WHERE event_type = ?",
    [event_type]
  );
  res.json({ success: true, deleted: result.affectedRows });
});

// DELETE /api/audit-log/bulk – xóa nhiều log theo danh sách ID (admin only)
router.delete("/bulk", verifyJWT, requireRole("admin"), async (req: Request, res: Response): Promise<void> => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) {
    res.status(400).json({ error: "INVALID_IDS" });
    return;
  }
  const numIds = (ids as unknown[]).map(Number).filter((n) => Number.isFinite(n) && n > 0);
  if (numIds.length === 0) {
    res.status(400).json({ error: "INVALID_IDS" });
    return;
  }
  const placeholders = numIds.map(() => "?").join(",");
  const [result] = await (pool as any).execute(
    `DELETE FROM audit_log WHERE id IN (${placeholders})`,
    numIds
  );
  res.json({ success: true, deleted: (result as any).affectedRows });
});

// DELETE /api/audit-log/data-recv – giữ lại để tương thích ngược
router.delete("/data-recv", verifyJWT, requireRole("admin"), async (_req: Request, res: Response): Promise<void> => {
  const [result] = await (pool as any).execute(
    "DELETE FROM audit_log WHERE event_type = 'DATA_RECV'"
  );
  res.json({ success: true, deleted: result.affectedRows });
});

// GET /api/audit-log  – filter by event_type, device_id, from, to; sorted DESC
router.get("/", verifyJWT, async (req: Request, res: Response): Promise<void> => {
  const { event_type, device_id, from, to } = req.query;
  const user = (req as any).user;
  const allowedTypes = ALLOWED_EVENT_TYPES_BY_ROLE[user?.role] ?? [];

  const conditions: string[] = [];
  const params: (string | number | Date)[] = [];

  if (event_type && typeof event_type === "string") {
    if (!allowedTypes.includes(event_type)) {
      res.status(403).json({ error: "FORBIDDEN" });
      return;
    }
    conditions.push("a.event_type = ?");
    params.push(event_type);
  } else {
    conditions.push(`a.event_type IN (${allowedTypes.map(() => "?").join(",")})`);
    params.push(...allowedTypes);
  }
  if (device_id) {
    const id = Number(device_id);
    if (!Number.isFinite(id) || id <= 0) {
      res.status(400).json({ error: "INVALID_DEVICE_ID" });
      return;
    }
    conditions.push("a.device_id = ?");
    params.push(id);
  }
  if (from && typeof from === "string") {
    const date = new Date(from);
    if (isNaN(date.getTime())) {
      res.status(400).json({ error: "INVALID_FROM_DATE" });
      return;
    }
    conditions.push("a.created_at >= ?");
    params.push(date);
  }
  if (to && typeof to === "string") {
    const date = new Date(to);
    if (isNaN(date.getTime())) {
      res.status(400).json({ error: "INVALID_TO_DATE" });
      return;
    }
    conditions.push("a.created_at <= ?");
    params.push(date);
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const sql = `
    SELECT
      a.id,
      a.event_type,
      a.device_id,
      d.device_id  AS device_identifier,
      d.device_name,
      a.ip_address,
      d.last_ip    AS device_ip,
      a.user_agent,
      a.details,
      a.created_at
    FROM audit_log a
    LEFT JOIN devices d ON a.device_id = d.id
    ${where}
    ORDER BY a.created_at DESC
    LIMIT 500
  `;

  const [rows] = await (pool as any).query(sql, params);

  res.json({ audit_log: rows });
});

export default router;
