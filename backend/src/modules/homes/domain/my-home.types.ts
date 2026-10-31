// Kiểu dùng chung của Customer API (CONTRACT_V2 §4). Nằm ở domain/ vì list-my-homes và accept-invitation
// (hai feature không được import lẫn nhau) cùng trả MyHome.
import type { MemberRole } from "../../../shared/types/domain";
import type { Home } from "./home.types";

/** Phần tử của GET /homes và kết quả accept invitation (CONTRACT §4.2). */
export interface MyHome {
  home: Home;
  role: MemberRole;
  device_count: number;
  online_count: number;
  expires_at: string | null;
}
