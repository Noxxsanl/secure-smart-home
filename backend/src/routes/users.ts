import bcrypt from "bcrypt";
import { Router, Request, Response } from "express";
import pool from "../config/db";
import { verifyJWT } from "../middleware/verifyJWT";
import { requireRole } from "../middleware/rbac";

const router = Router();

// GET /api/users  – admin only
router.get("/", verifyJWT, requireRole("admin"), async (_req: Request, res: Response): Promise<void> => {
  const [rows] = await pool.execute<any[]>(
    "SELECT id, username, role, created_at, last_login FROM users ORDER BY created_at DESC"
  );
  res.json({ users: rows });
});

// POST /api/users  – admin only, create operator
router.post("/", verifyJWT, requireRole("admin"), async (req: Request, res: Response): Promise<void> => {
  const { username, password, role } = req.body ?? {};

  if (!username || !password || !role) {
    res.status(400).json({ error: "MISSING_FIELDS" });
    return;
  }
  if (role !== "operator") {
    res.status(400).json({ error: "INVALID_ROLE" });
    return;
  }
  if (typeof username !== "string" || username.length < 3 || username.length > 32) {
    res.status(400).json({ error: "INVALID_USERNAME" });
    return;
  }
  if (typeof password !== "string" || password.length < 6) {
    res.status(400).json({ error: "PASSWORD_TOO_SHORT" });
    return;
  }

  const [existing] = await pool.execute<any[]>(
    "SELECT id FROM users WHERE username = ?",
    [username]
  );
  if ((existing as any[]).length > 0) {
    res.status(409).json({ error: "USERNAME_TAKEN" });
    return;
  }

  const hash = await bcrypt.hash(password, 12);
  const [result] = await pool.execute<any>(
    "INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)",
    [username, hash, role]
  );

  res.status(201).json({
    user: { id: result.insertId, username, role },
  });
});

// PATCH /api/users/:id/password  – admin only
router.patch("/:id/password", verifyJWT, requireRole("admin"), async (req: Request, res: Response): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id) || id <= 0) {
    res.status(400).json({ error: "INVALID_ID" });
    return;
  }
  const { password } = req.body ?? {};
  if (typeof password !== "string" || password.length < 6) {
    res.status(400).json({ error: "PASSWORD_TOO_SHORT" });
    return;
  }

  const [rows] = await pool.execute<any[]>("SELECT id, role FROM users WHERE id = ?", [id]);
  const user = (rows as any[])[0];
  if (!user) {
    res.status(404).json({ error: "NOT_FOUND" });
    return;
  }

  const hash = await bcrypt.hash(password, 12);
  await pool.execute("UPDATE users SET password_hash = ? WHERE id = ?", [hash, id]);
  res.json({ success: true });
});

// DELETE /api/users/:id  – admin only, cannot delete self
router.delete("/:id", verifyJWT, requireRole("admin"), async (req: Request, res: Response): Promise<void> => {
  const id = Number(req.params.id);
  const self = (req as any).user?.id;

  if (!Number.isFinite(id) || id <= 0) {
    res.status(400).json({ error: "INVALID_ID" });
    return;
  }
  if (id === self) {
    res.status(400).json({ error: "CANNOT_DELETE_SELF" });
    return;
  }

  const [rows] = await pool.execute<any[]>("SELECT id, role FROM users WHERE id = ?", [id]);
  const user = (rows as any[])[0];
  if (!user) {
    res.status(404).json({ error: "NOT_FOUND" });
    return;
  }
  if (user.role === "admin") {
    res.status(403).json({ error: "CANNOT_DELETE_ADMIN" });
    return;
  }

  await pool.execute("DELETE FROM users WHERE id = ?", [id]);
  res.json({ success: true });
});

export default router;
