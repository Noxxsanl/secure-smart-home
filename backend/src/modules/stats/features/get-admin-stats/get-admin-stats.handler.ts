// Số liệu Dashboard Admin: khách/nhà/thiết bị, cảnh báo nghiêm trọng, rollout firmware, hoạt động gần đây.
import { countLogs, latestLogs } from "../../../audit";
import type { LogCategory } from "../../../audit";
import { listRecentActivations } from "../../../identity";
import { listDeployments } from "../../../ota";
import { DAY_MS } from "../../domain/time-window";
import {
  countCustomers,
  deviceCounts,
  gatewayCounts,
  homeStatusCounts,
} from "../../infrastructure/stats.read-model";
import type { AdminStats } from "./get-admin-stats.dto";

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
