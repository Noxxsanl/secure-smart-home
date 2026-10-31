// Chi tiết gateway trên console (FR-9.1): DTO, nhà, node, log gateway/provision gần nhất.
import type { AuthContext } from "../../../../core/auth/auth-context";
import { canSeeCustomerData, getHomeSummary, loadStaffScope } from "../../../homes";
import type { SmartHomeRow } from "../../../homes";
import { latestLogs } from "../../../audit";
import type { LogEntry } from "../../../audit";
import { requireGateway } from "../../domain/console-access";
import { EMPTY_COUNTS } from "../../domain/gateway-counts";
import type { ConsoleDevice, Gateway } from "../../domain/device.types";
import { getGatewayCounts, toConsoleDevice, toGateway } from "../../infrastructure/device.read-model";
import { listNodeRows } from "../../infrastructure/gateways.repository";

export async function getGatewayDetail(
  auth: AuthContext,
  id: number
): Promise<{ gateway: Gateway; home: SmartHomeRow | null; nodes: ConsoleDevice[]; logs: LogEntry[] }> {
  const row = await requireGateway(id);
  const scope = await loadStaffScope(auth);
  const visible = canSeeCustomerData(scope, { id: row.home_id, status: row.home_status });
  const [counts, nodeRows, home, logs] = await Promise.all([
    getGatewayCounts([id]),
    listNodeRows(id),
    row.home_id === null ? Promise.resolve(null) : getHomeSummary(row.home_id),
    latestLogs({ categories: ["gateway", "provision"], deviceId: id }, 50),
  ]);
  return {
    gateway: toGateway(row, counts.get(id) ?? EMPTY_COUNTS),
    home,
    // Trạng thái relay của nhà đã claim là dữ liệu khách → che khi Operator chưa có grant
    nodes: nodeRows.map((node) => {
      const dto = toConsoleDevice(node);
      return visible ? dto : { ...dto, power: null };
    }),
    logs,
  };
}
