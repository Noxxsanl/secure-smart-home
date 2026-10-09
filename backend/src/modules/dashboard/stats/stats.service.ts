// Stats cho console (CONTRACT §5 Stats): badges, dashboard Operator, dashboard Admin.
import type { AuthContext } from "../../auth/auth.types";
import type { LogCategory } from "../../logs/eventCatalog";
import { listRecentActivations } from "../customers/customers.repository";
import type { ActivationRecord, LogEntry, OperatorAccessGrant, OtaDeployment, SmartHomeRow } from "../dashboard.types";
import { countRunningJobs, listDeployments } from "../firmware/ota.repository";
import { countLogs, latestLogs } from "../logs/logs.repository";
import { OPERATOR_LOG_CATEGORIES } from "../logs/logs.service";
import { countUnreadStaff } from "../notifications/staffNotifications.repository";
import { listGrants } from "../operator-access/operatorAccess.repository";
import { listHomeRows } from "../smart-homes/smartHomes.repository";
import {
  countCustomers,
  countUnclaimedHomes,
  deviceCounts,
  gatewayCounts,
  homeStatusCounts,
} from "./stats.repository";

const DAY_MS = 24 * 3600 * 1000;

export interface ConsoleBadges {
  unclaimed_homes: number;
  offline_gateways: number;
  ota_in_progress: number;
  unread_notifications: number;
}

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

export interface OperatorStats {
  provisioning_queue: SmartHomeRow[];
  active_access_grants: OperatorAccessGrant[];
  open_tickets: number;
  alerts_to_handle: number;
  gateways_offline: number;
  gateways_total: number;
  recent_logs: LogEntry[];
}

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

// recent_activity: mọi category trừ mqtt (DATA_RECV mỗi vài giây sẽ nhấn chìm hoạt động thật)
const ACTIVITY_CATEGORIES: readonly LogCategory[] = ["gateway", "device", "provision", "security", "auth", "activity", "automation", "ota", "error"];

export async function getAdminStats(): Promise<AdminStats> {
  const since = new Date(Date.now() - DAY_MS);
  const [customers, homes, gateways, devices, openAlerts, topErrors, rollouts, activity, activations] = await Promise.all([
    countCustomers(),
    homeStatusCounts(),
    gatewayCounts(),
    deviceCounts(),
    countLogs(["gateway", "device", "provision", "mqtt", "security", "auth", "activity", "automation", "ota", "error"], ["critical"], since),
    latestLogs({ categories: ["error", "security", "gateway"], severity: "critical", from: since }, 5),
    listDeployments({ inProgressOnly: true, limit: 20 }),
    latestLogs({ categories: ACTIVITY_CATEGORIES }, 10),
    listRecentActivations(8),
  ]);
  return {
    total_customers: customers,
    total_smart_homes: homes.total,
    unclaimed_homes: homes.unclaimed,
    active_homes: homes.active,
    suspended_homes: homes.suspended,
    gateways_online: gateways.online,
    gateways_total: gateways.total,
    devices_online: devices.online,
    devices_total: devices.total,
    open_alerts: openAlerts,
    top_errors: topErrors,
    firmware_rollouts: rollouts,
    recent_activity: activity,
    recent_activations: activations,
  };
}
