import { Router, Request, Response } from "express";
import { queryOne, queryRows, runSql } from "../../../infrastructure/database/db";
import { verifyJWT } from "../middleware/verify-jwt";
import { requireRole } from "../middleware/require-role";

const router = Router();

// GET /api/notifications  – admin only
router.get("/", verifyJWT, requireRole("admin"), async (_req: Request, res: Response): Promise<void> => {
  const unreadRow = await queryOne<{ unread_count: number }>(
    "SELECT COUNT(*) AS unread_count FROM notifications WHERE target_role = 'admin' AND is_read = FALSE"
  );
  const unread_count = unreadRow?.unread_count ?? 0;

  const rows = await queryRows<Record<string, unknown> & { is_read: unknown }>(
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
  await runSql("UPDATE notifications SET is_read = TRUE WHERE target_role = 'admin'");
  res.json({ success: true });
});

// PATCH /api/notifications/:id/read  – admin only
router.patch("/:id/read", verifyJWT, requireRole("admin"), async (req: Request, res: Response): Promise<void> => {
  const numId = parseInt(String(req.params.id), 10);
  if (isNaN(numId) || numId <= 0 || numId > 2147483647) {
    res.status(400).json({ error: "INVALID_ID" });
    return;
  }
  await runSql("UPDATE notifications SET is_read = TRUE WHERE id = ? AND target_role = 'admin'", [numId]);
  res.json({ success: true });
});

export default router;
