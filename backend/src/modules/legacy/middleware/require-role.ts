import { NextFunction, Request, Response } from "express";

// Middleware factory – gọi sau verifyJWT để req.user đã có sẵn.
// Nhận danh sách role được phép dưới dạng variadic, một helper dùng cho mọi trường hợp:
//   requireRole("admin")                  → chỉ admin
//   requireRole("admin", "operator")      → admin + operator
export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = (req as any).user;
    if (!user || !roles.includes(user.role)) {
      res.status(403).json({ error: "FORBIDDEN" });
      return;
    }
    next();
  };
}
