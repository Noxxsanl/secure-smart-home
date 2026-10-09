import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { findAuthUserById } from "../modules/auth/auth.repository";

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

  let payload: JWTPayload & { typ?: unknown };
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET!) as JWTPayload & { typ?: unknown };
  } catch {
    // Bắt cả TokenExpiredError lẫn JsonWebTokenError
    res.status(401).json({ error: "INVALID_TOKEN" });
    return;
  }

  // Token V2 (dashboard/portal) ký cùng JWT_SECRET nhưng luôn có `typ` — không chấp nhận ở kênh legacy,
  // nếu không khách hàng tự đăng ký có thể dán cookie sh_user vào cookie `token` để đọc thiết bị mọi nhà.
  if (payload.typ !== undefined) {
    res.status(401).json({ error: "INVALID_TOKEN" });
    return;
  }

  // Nạp lại user mỗi request để tài khoản bị khoá/xoá/đổi role mất quyền ngay (FR-11.4),
  // và chỉ nhân viên mới dùng được các route legacy.
  const user = await findAuthUserById(Number(payload.id));
  if (!user || user.role !== payload.role || (user.role !== "admin" && user.role !== "operator")) {
    res.status(401).json({ error: "INVALID_TOKEN" });
    return;
  }
  if (user.status === "locked") {
    res.status(403).json({ error: "ACCOUNT_LOCKED" });
    return;
  }

  // Gắn payload để các handler phía sau (rbac, routes) có thể đọc role/id
  (req as any).user = payload;
  next();
}
