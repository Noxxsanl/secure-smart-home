import crypto from "crypto";
import { Router, Request, Response } from "express";
import { queryOne, queryRows, runSql } from "../../../infrastructure/database/db";
import { verifyJWT } from "../middleware/verify-jwt";
import { requireRole } from "../middleware/require-role";
import { log } from "../../audit";
import { createNotification } from "../infrastructure/legacy-notification";

function sanitize(value: unknown, maxLength: number): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLength);
}

// PostgreSQL báo lỗi (22P02 → 500) khi so cột INT với chuỗi không phải số, trong khi MySQL âm thầm
// coi là 0 và trả "không tìm thấy". Chuẩn hoá :id ở một chỗ: không hợp lệ → null → 404 DEVICE_NOT_FOUND như cũ.
function parseDeviceId(raw: unknown): number | null {
  if (typeof raw !== "string" || !/^\d{1,9}$/.test(raw)) return null;
  const id = Number(raw);
  return id > 0 ? id : null;
}

const router = Router();

// POST /api/devices/register  – admin or operator only
router.post(
  "/register",
  verifyJWT,
  requireRole("admin", "operator"),
  async (req: Request, res: Response): Promise<void> => {
    const raw = req.body ?? {};
    const device_name = sanitize(raw.device_name, 128);
    const device_type = sanitize(raw.device_type, 16);
    const location = raw.location ? sanitize(raw.location, 256) || null : null;

    if (!device_name || !device_type) {
      res.status(400).json({ error: "MISSING_FIELDS" });
      return;
    }

    if (device_type !== "sensor" && device_type !== "gateway") {
      res.status(400).json({ error: "INVALID_DEVICE_TYPE" });
      return;
    }

    const suffix = crypto.randomBytes(4).toString("hex").toUpperCase();
    const typeTag = device_type === "sensor" ? "SN" : "GW";
    const device_id = `ESP32-${typeTag}-${suffix}`;
    const secret_key = crypto.randomBytes(32).toString("hex");

    const user = (req as any).user;
    const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0].trim() ?? req.socket.remoteAddress ?? null;
    const user_agent = req.headers["user-agent"] ?? null;

    // category là loại chức năng V2; route cũ chỉ biết sensor|gateway nên gateway phải mang category
    // 'gateway' (mặc định cột là 'sensor' → gateway đăng ký ở đây từng bị xếp nhầm thành sensor).
    const category = device_type === "gateway" ? "gateway" : "sensor";
    const result = await runSql(
      `INSERT INTO devices (device_id, device_name, device_type, category, secret_key, status, location, fail_count, created_by)
       VALUES (?, ?, ?, ?, ?, 'inactive', ?, 0, ?) RETURNING id`,
      [device_id, device_name, device_type, category, secret_key, location ?? null, user.id]
    );

    const insertedId = result.insertId;

    await log("DEVICE_REGISTER", insertedId, ip, user_agent, {
      device_id,
      device_name,
      device_type,
      registered_by: user.username,
    });

    if (user.role === "operator") {
      createNotification({
        title: "Thiết bị mới được đăng ký",
        message: `Operator ${user.username} đã đăng ký thiết bị ${device_id}`,
        type: "DEVICE_REGISTER",
        actor_id: user.id,
        actor_username: user.username,
        actor_role: user.role,
        related_device_id: insertedId,
      }).catch(() => {});
    }

    // Return credentials exactly once – secret_key is never returned again
    res.status(201).json({
      success: true,
      device: {
        id: insertedId,
        device_id,
        device_name,
        device_type,
        location: location ?? null,
        status: "inactive",
        secret_key,
      },
    });
  }
);

// GET /api/devices  – any authenticated user
router.get("/", verifyJWT, async (_req: Request, res: Response): Promise<void> => {
  const rows = await queryRows<Record<string, unknown>>(
    `SELECT
       d.id,
       d.device_id,
       d.device_name,
       d.device_type,
       d.status,
       d.location,
       d.fail_count,
       d.last_seen,
       d.created_at,
       CASE
         WHEN d.last_seen IS NOT NULL AND d.last_seen > NOW() - make_interval(secs => 60)
         THEN TRUE ELSE FALSE
       END AS is_online
     FROM devices d
     ORDER BY d.created_at DESC`
  );
  res.json({ devices: rows });
});

// GET /api/devices/:id/data  – paginated sensor history (page, limit)
router.get("/:id/data", verifyJWT, async (req: Request, res: Response): Promise<void> => {
  const id = parseDeviceId(req.params.id);
  const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10) || 1);
  const limit = Math.min(200, Math.max(1, parseInt(String(req.query.limit ?? "50"), 10) || 50));
  const offset = (page - 1) * limit;

  const device = id === null ? null : await queryOne<{ id: number }>("SELECT id FROM devices WHERE id = ?", [id]);
  if (!device) {
    res.status(404).json({ error: "DEVICE_NOT_FOUND" });
    return;
  }

  const totalRow = await queryOne<{ total: number }>(
    "SELECT COUNT(*) AS total FROM sensor_data WHERE device_id = ?",
    [device.id]
  );
  const total = totalRow?.total ?? 0;

  const dataRows = await queryRows<Record<string, unknown>>(
    `SELECT sd.id, sd.device_id, sd.gateway_id, gw.device_id AS gateway_device_id, sd.payload, sd.received_at
     FROM sensor_data sd
     LEFT JOIN devices gw ON sd.gateway_id = gw.id
     WHERE sd.device_id = ?
     ORDER BY sd.received_at DESC
     LIMIT ${limit} OFFSET ${offset}`,
    [device.id]
  );

  res.json({
    data: dataRows,
    pagination: {
      page,
      limit,
      total: Number(total),
      total_pages: Math.ceil(Number(total) / limit),
    },
  });
});

// GET /api/devices/:id  – any authenticated user
router.get("/:id", verifyJWT, async (req: Request, res: Response): Promise<void> => {
  const id = parseDeviceId(req.params.id);

  const device = id === null ? null : await queryOne<Record<string, unknown>>(
    `SELECT
       d.id,
       d.device_id,
       d.device_name,
       d.device_type,
       d.status,
       d.location,
       d.fail_count,
       d.last_seen,
       d.created_at,
       CASE
         WHEN d.last_seen IS NOT NULL AND d.last_seen > NOW() - make_interval(secs => 60)
         THEN TRUE ELSE FALSE
       END AS is_online
     FROM devices d
     WHERE d.id = ?`,
    [id]
  );

  if (!device) {
    res.status(404).json({ error: "DEVICE_NOT_FOUND" });
    return;
  }

  const dataRows = await queryRows<Record<string, unknown>>(
    `SELECT id, device_id, gateway_id, payload, received_at
     FROM sensor_data
     WHERE device_id = ?
     ORDER BY received_at DESC
     LIMIT 10`,
    [id]
  );

  res.json({ device, recent_data: dataRows });
});

// PATCH /api/devices/:id/status  – admin or operator only
router.patch(
  "/:id/status",
  verifyJWT,
  requireRole("admin", "operator"),
  async (req: Request, res: Response): Promise<void> => {
    const id = parseDeviceId(req.params.id);
    const { status } = req.body ?? {};

    if (!status || !["active", "blocked", "inactive"].includes(status)) {
      res.status(400).json({ error: "INVALID_STATUS" });
      return;
    }

    const device = id === null ? null : await queryOne<{ id: number; device_id: string }>(
      "SELECT id, device_id FROM devices WHERE id = ?",
      [id]
    );

    if (!device) {
      res.status(404).json({ error: "DEVICE_NOT_FOUND" });
      return;
    }

    if (status === "active") {
      await runSql("UPDATE devices SET status = ?, fail_count = 0 WHERE id = ?", [status, device.id]);
    } else {
      await runSql("UPDATE devices SET status = ? WHERE id = ?", [status, device.id]);
    }

    const user = (req as any).user;
    const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0].trim() ?? req.socket.remoteAddress ?? null;
    const user_agent = req.headers["user-agent"] ?? null;

    await log("DEVICE_STATUS_CHANGE", device.id, ip, user_agent, {
      device_id: device.device_id,
      new_status: status,
      changed_by: user.username,
    });

    if (user.role === "operator") {
      let title: string;
      let message: string;
      let type: string;
      if (status === "blocked") {
        title = "Thiết bị bị chặn";
        message = `Operator ${user.username} đã chặn thiết bị ${device.device_id}`;
        type = "DEVICE_BLOCKED";
      } else if (status === "active") {
        title = "Thiết bị được mở khóa";
        message = `Operator ${user.username} đã bỏ chặn thiết bị ${device.device_id}`;
        type = "DEVICE_UNBLOCKED";
      } else {
        title = "Cập nhật trạng thái thiết bị";
        message = `Operator ${user.username} đã cập nhật trạng thái thiết bị ${device.device_id}`;
        type = "DEVICE_STATUS_CHANGE";
      }
      createNotification({
        title,
        message,
        type,
        actor_id: user.id,
        actor_username: user.username,
        actor_role: user.role,
        related_device_id: device.id,
      }).catch(() => {});
    }

    res.json({ success: true, id: device.id, status });
  }
);

// DELETE /api/devices/:id  – admin only
router.delete(
  "/:id",
  verifyJWT,
  requireRole("admin"),
  async (req: Request, res: Response): Promise<void> => {
    const id = parseDeviceId(req.params.id);

    const device = id === null ? null : await queryOne<{ id: number; device_id: string; device_name: string }>(
      "SELECT id, device_id, device_name FROM devices WHERE id = ?",
      [id]
    );

    if (!device) {
      res.status(404).json({ error: "DEVICE_NOT_FOUND" });
      return;
    }

    // Cascade: delete child records before the device row
    await runSql("DELETE FROM sensor_data WHERE device_id = ?", [device.id]);
    await runSql("DELETE FROM device_tokens WHERE device_id = ?", [device.id]);
    await runSql("DELETE FROM devices WHERE id = ?", [device.id]);

    const user = (req as any).user;
    const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0].trim() ?? req.socket.remoteAddress ?? null;
    const user_agent = req.headers["user-agent"] ?? null;

    await log("DEVICE_DELETE", null, ip, user_agent, {
      deleted_device_id: device.device_id,
      device_name: device.device_name,
      deleted_by: user.username,
    });

    res.json({ success: true });
  }
);

export default router;
