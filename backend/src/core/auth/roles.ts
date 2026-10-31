// Kiểm role hệ thống trên AuthContext (không truy vấn DB).
import { forbidden } from "../../shared/errors/http-error";
import type { AuthContext } from "./auth-context";

/** Chỉ ADMIN — ném 403 FORBIDDEN cho OPERATOR. */
export function requireAdmin(auth: AuthContext): void {
  if (auth.role !== "admin") throw forbidden("Admin role required");
}
