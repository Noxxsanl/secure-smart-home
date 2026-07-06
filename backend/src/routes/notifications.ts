import { Router, Request, Response } from "express";
import pool from "../config/db";
import { verifyJWT } from "../middleware/verifyJWT";
import { requireRole } from "../middleware/rbac";

const router = Router();

// GET /api/notifications  – admin only
router.get("/", verifyJWT, requireRole("admin"), async (_req: Request, res: Response): Promise<void> => {
  const [[{ unread_count }]] = await pool.execute<any[]>(
    "SELECT COUNT(*) AS unread_count FROM notifications WHERE target_role = 'admin' AND is_read = 0"
  );

  const [rows] = await pool.execute<any[]>(
    `SELECT id, title, message, type, actor_id, actor_username, actor_role,
            related_device_id, is_read, created_at
     FROM notifications
     WHERE target_role = 'admin'
     ORDER BY created_at DESC
     LIMIT 50`
  );

  res.json({
    notifications: rows.map((r) => ({ ...r, is_read: Boolean(r.is_read) })),
    unread_count: Number(unread_count),
  });
});

// PATCH /api/notifications/read-all  – admin only
router.patch("/read-all", verifyJWT, requireRole("admin"), async (_req: Request, res: Response): Promise<void> => {
  await pool.execute("UPDATE notifications SET is_read = 1 WHERE target_role = 'admin'");
  res.json({ success: true });
});

// PATCH /api/notifications/:id/read  – admin only
router.patch("/:id/read", verifyJWT, requireRole("admin"), async (req: Request, res: Response): Promise<void> => {
  const numId = parseInt(String(req.params.id), 10);
  if (isNaN(numId)) {
    res.status(400).json({ error: "INVALID_ID" });
    return;
  }
  await pool.execute(
    "UPDATE notifications SET is_read = 1 WHERE id = ? AND target_role = 'admin'",
    [numId]
  );
  res.json({ success: true });
});

export default router;
