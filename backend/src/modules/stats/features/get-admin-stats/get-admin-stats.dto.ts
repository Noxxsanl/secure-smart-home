// Response GET /api/dashboard/stats/admin (CONTRACT §5 Stats).
import type { LogEntry } from "../../../audit";
import type { ActivationRecord } from "../../../homes";
import type { OtaDeployment } from "../../../ota";

export interface AdminStats {
  total_customers: number;
  total_smart_homes: number;
  unclaimed_homes: number;
  active_homes: number;
  suspended_homes: number;
  gateways_online: number;
  gateways_total: number;
  devices_online: number;
  devices_total: number;
  open_alerts: number;
  top_errors: LogEntry[];
  firmware_rollouts: OtaDeployment[];
  recent_activity: LogEntry[];
  recent_activations: ActivationRecord[];
}
