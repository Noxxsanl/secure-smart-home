// Badge trên thanh điều hướng console: nhà chưa claim, gateway mất kết nối, OTA đang chạy, thông báo chưa đọc.
import type { AuthContext } from "../../../../core/auth/auth-context";
import { countUnreadStaff } from "../../../notifications";
import { countRunningJobs } from "../../../ota";
import { countUnclaimedHomes, gatewayCounts } from "../../infrastructure/stats.read-model";
import type { ConsoleBadges } from "./get-badges.dto";

export async function getBadges(auth: AuthContext): Promise<ConsoleBadges> {
  const [unclaimed, gateways, ota, unread] = await Promise.all([
    countUnclaimedHomes(),
    gatewayCounts(),
    countRunningJobs(),
    countUnreadStaff(auth.role),
  ]);
  return {
    unclaimed_homes: unclaimed,
    offline_gateways: Math.max(0, gateways.total - gateways.online),
    ota_in_progress: ota,
    unread_notifications: unread,
  };
}
