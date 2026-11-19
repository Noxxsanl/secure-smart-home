// Response GET /api/dashboard/stats/operator (CONTRACT §5 Stats).
import type { LogEntry } from "../../../audit";
import type { OperatorAccessGrant, SmartHomeRow } from "../../../homes";

export interface OperatorStats {
  provisioning_queue: SmartHomeRow[];
  active_access_grants: OperatorAccessGrant[];
  open_tickets: number;
  alerts_to_handle: number;
  gateways_offline: number;
  gateways_total: number;
  recent_logs: LogEntry[];
}
