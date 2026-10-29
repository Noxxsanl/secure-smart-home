import bcrypt from "bcrypt";
import { Router, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { queryOne, runSql } from "../lib/db";
import { verifyJWT } from "../middleware/verifyJWT";
import { createNotification } from "../services/notificationService";

const router = Router();

// POST /api/auth/login
router.post("/login", async (req: Request, res: Response): Promise<void> => {
  const raw = req.body ?? {};
  const username = typeof raw.username === "string" ? raw.username.trim().slice(0, 64) : "";
  const password = typeof raw.password === "string" ? raw.password.slice(0, 128) : "";

  if (!username || !password) {
    res.status(400).json({ error: "MISSING_FIELDS" });
    return;
  }

  // LOWER(): PostgreSQL phân biệt hoa/thường (MySQL utf8mb4_unicode_ci thì không); khớp unique index LOWER(username).
  const user = await queryOne<{ id: number; username: string; password_hash: string; role: string; status: string }>(
    "SELECT id, username, password_hash, role, status FROM users WHERE LOWER(username) = LOWER(?)",
    [username]
  );

  // Use a constant-time path to prevent timing-based user enumeration
  const dummyHash = "$2b$12$invalidhashpaddingtomatchbcryptlength000000000000000000";
  const valid = user
    ? await bcrypt.compare(password, user.password_hash)
    : await bcrypt.compare(password, dummyHash).then(() => false);

  if (!user || !valid) {
    res.status(401).json({ error: "INVALID_CREDENTIALS" });
    return;
  }

  // V2: tài khoản bị khoá (users.status = 'locked') không được đăng nhập kể cả qua endpoint cũ này
  if (user.status === "locked") {
    res.status(403).json({ error: "ACCOUNT_LOCKED" });
    return;
  }

  await runSql("UPDATE users SET last_login = NOW() WHERE id = ?", [user.id]);

  // Notify admin when operator logs in
  if (user.role === "operator") {
    createNotification({
      title: `Operator đã đăng nhập`,
      message: `Operator ${user.username} đã đăng nhập hệ thống`,
      type: "LOGIN",
      actor_id: user.id,
      actor_username: user.username,
      actor_role: user.role,
    }).catch(() => {});
  }

  const token = jwt.sign(
    { id: user.id, username: user.username, role: user.role },
    process.env.JWT_SECRET!,
    { expiresIn: "8h" }
  );

  res.cookie("token", token, {
    httpOnly: true,
    maxAge: 8 * 60 * 60 * 1000,
    sameSite: "strict",
  });

  res.json({ success: true, user: { id: user.id, username: user.username, role: user.role } });
});

// POST /api/auth/logout
router.post("/logout", (_req: Request, res: Response): void => {
  res.clearCookie("token");
  res.json({ success: true });
});

// GET /api/auth/me
router.get("/me", verifyJWT, (req: Request, res: Response): void => {
  res.json({ user: (req as any).user });
});

export default router;
