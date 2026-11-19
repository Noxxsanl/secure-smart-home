// Response của GET /homes/:homeId/overview (CONTRACT §4.2).
import type { MemberRole } from "../../../../shared/types/domain";
import type { CustomerDevice } from "../../../devices";
import type { Home, RoomSummary } from "../../domain/home.types";

export interface HomeOverview {
  home: Home;
  role: MemberRole;
  gateway: { id: number; uid: string; status: "online" | "offline"; last_seen: string | null } | null;
  rooms: RoomSummary[];
  devices: CustomerDevice[];
  open_alerts: number;
  pending_suggestions: number;
  unread_notifications: number;
}
