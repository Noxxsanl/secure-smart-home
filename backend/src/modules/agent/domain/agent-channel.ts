// Kênh của dữ liệu Trợ lý tạo ra, lấy từ `req.auth.channel` (KHÔNG tin body): portal → 'web', mobile → 'mobile'.
import type { AuthContext } from "../../../core/auth/auth-context";
import type { CustomerChannel } from "../../../shared/types/domain";

export function channelOfAuth(auth: AuthContext): CustomerChannel {
  return auth.channel === "mobile" ? "mobile" : "web";
}
