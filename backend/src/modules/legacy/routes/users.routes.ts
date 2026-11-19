import bcrypt from "bcrypt";
import { Router, Request, Response } from "express";
import { isDuplicateKeyError, queryOne, queryRows, runSql } from "../../../infrastructure/database/db";
import { verifyJWT } from "../middleware/verify-jwt";
import { requireRole } from "../middleware/require-role";

const router = Router();

// GET /api/users  – admin only
router.get("/", verifyJWT, requireRole("admin"), async (_req: Request, res: Response): Promise<void> => {
  const rows = await queryRows<Record<string, unknown>>(
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

  // LOWER(): username duy nhất không phân biệt hoa/thường (unique index LOWER(username)).
  const existing = await queryOne<{ id: number }>("SELECT id FROM users WHERE LOWER(username) = LOWER(?)", [username]);
  if (existing) {
    res.status(409).json({ error: "USERNAME_TAKEN" });
    return;
  }

  const hash = await bcrypt.hash(password, 12);
  let result;
  try {
    result = await runSql(
      "INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?) RETURNING id",
      [username, hash, role]
    );
  } catch (err) {
    // Hai request cùng username chạy song song: lọt qua bước kiểm trên, unique index chặn ở đây.
    if (isDuplicateKeyError(err)) {
      res.status(409).json({ error: "USERNAME_TAKEN" });
      return;
    }
    throw err;
  }

  res.status(201).json({
    user: { id: result.insertId, username, role },
  });
});

// PATCH /api/users/:id/password  – admin only
router.patch("/:id/password", verifyJWT, requireRole("admin"), async (req: Request, res: Response): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0 || id > 2147483647) { // INT: vượt miền thì PostgreSQL báo lỗi thay vì trả rỗng
    res.status(400).json({ error: "INVALID_ID" });
    return;
  }
  const { password } = req.body ?? {};
  if (typeof password !== "string" || password.length < 6) {
    res.status(400).json({ error: "PASSWORD_TOO_SHORT" });
    return;
  }

  const user = await queryOne<{ id: number; role: string }>("SELECT id, role FROM users WHERE id = ?", [id]);
  if (!user) {
    res.status(404).json({ error: "NOT_FOUND" });
    return;
  }

  const hash = await bcrypt.hash(password, 12);
  await runSql("UPDATE users SET password_hash = ? WHERE id = ?", [hash, id]);
  res.json({ success: true });
});

// DELETE /api/users/:id  – admin only, cannot delete self
router.delete("/:id", verifyJWT, requireRole("admin"), async (req: Request, res: Response): Promise<void> => {
  const id = Number(req.params.id);
  const self = (req as any).user?.id;

  if (!Number.isSafeInteger(id) || id <= 0 || id > 2147483647) { // INT: vượt miền thì PostgreSQL báo lỗi thay vì trả rỗng
    res.status(400).json({ error: "INVALID_ID" });
    return;
  }
  if (id === self) {
    res.status(400).json({ error: "CANNOT_DELETE_SELF" });
    return;
  }

  const user = await queryOne<{ id: number; role: string }>("SELECT id, role FROM users WHERE id = ?", [id]);
  if (!user) {
    res.status(404).json({ error: "NOT_FOUND" });
    return;
  }
  if (user.role === "admin") {
    res.status(403).json({ error: "CANNOT_DELETE_ADMIN" });
    return;
  }

  await runSql("DELETE FROM users WHERE id = ?", [id]);
  res.json({ success: true });
});

export default router;
