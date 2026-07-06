import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";

export interface JWTPayload {
  id: number;
  username: string;
  role: string;
}

// Parse cookie thủ công để tránh phụ thuộc vào thư viện cookie-parser.
// Cookie token là HttpOnly nên JavaScript phía client không đọc được,
// nhưng trình duyệt vẫn tự động gửi kèm trong mọi request cùng origin.
function parseCookie(header: string | undefined, name: string): string | null {
  if (!header) return null;
  const entry = header.split(";").find((c) => c.trim().startsWith(`${name}=`));
  return entry ? entry.trim().slice(name.length + 1) : null;
}

export async function verifyJWT(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const token = parseCookie(req.headers.cookie, "token");

  if (!token) {
    res.status(401).json({ error: "NO_TOKEN" });
    return;
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET!) as JWTPayload;
    // Gắn payload để các handler phía sau (rbac, routes) có thể đọc role/id
    (req as any).user = payload;
    next();
  } catch {
    // Bắt cả TokenExpiredError lẫn JsonWebTokenError
    res.status(401).json({ error: "INVALID_TOKEN" });
  }
}
