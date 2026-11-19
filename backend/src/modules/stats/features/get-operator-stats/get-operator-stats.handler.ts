// Số liệu Dashboard Operator: hàng đợi cấp phát, grant đang có, cảnh báo cần xử lý, gateway, log gần đây.
import type { AuthContext } from "../../../../core/auth/auth-context";
import { OPERATOR_LOG_CATEGORIES, countLogs, latestLogs } from "../../../audit";
import { listGrants, listHomeRows } from "../../../homes";
import { countUnreadStaff } from "../../../notifications";
import { DAY_MS } from "../../domain/time-window";
import { gatewayCounts } from "../../infrastructure/stats.read-model";
import type { OperatorStats } from "./get-operator-stats.dto";

export async function getOperatorStats(auth: AuthContext): Promise<OperatorStats> {
  const since = new Date(Date.now() - DAY_MS);
  const [queue, grants, unread, alerts, gateways, recent] = await Promise.all([
    listHomeRows({ status: "unclaimed", limit: 20 }),
    listGrants({ operatorId: auth.userId, activeOnly: true, limit: 50 }),
    countUnreadStaff(auth.role),
    countLogs(OPERATOR_LOG_CATEGORIES, ["critical", "warning"], since),
    gatewayCounts(),
    latestLogs({ categories: OPERATOR_LOG_CATEGORIES }, 10),
  ]);
  return {
    provisioning_queue: queue,
    active_access_grants: grants,
    open_tickets: unread,
    alerts_to_handle: alerts,
    gateways_offline: Math.max(0, gateways.total - gateways.online),
    gateways_total: gateways.total,
    recent_logs: recent,
  };
}
