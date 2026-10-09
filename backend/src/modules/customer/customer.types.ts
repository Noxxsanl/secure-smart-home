// Kiểu dùng chung của Customer API (CONTRACT_V2 §4). Đặt riêng khỏi customer.routes.ts để các
// router con import không tạo vòng phụ thuộc.
import type { MemberRole } from "../../types/domain";
import type { Home } from "../homes/homes.types";

/** Kênh mount: mobile = /api/mobile (Bearer), web = /api/portal (cookie sh_user). */
export type CustomerChannel = "mobile" | "web";

/** Phần tử của GET /homes và kết quả accept invitation (CONTRACT §4.2). */
export interface MyHome {
  home: Home;
  role: MemberRole;
  device_count: number;
  online_count: number;
  expires_at: string | null;
}
