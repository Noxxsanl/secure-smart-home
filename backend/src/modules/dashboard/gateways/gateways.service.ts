// Gateway trên console (FR-9.1, 9.2): danh sách, chi tiết, restart / factory-reset qua MQTT.
import type { RequestMeta } from "../../../lib/clientIp";
import { notFound } from "../../../lib/http";
import { requireOperatorHomeAccess } from "../../access/access.service";
import type { AuthContext } from "../../auth/auth.types";
import { getDeviceRow, getGatewayCounts, toConsoleDevice, toGateway } from "../../devices/deviceReadModel";
import { sendGatewayCommand } from "../../devices/deviceCommand.service";
import type { DeviceRow, GatewayAction } from "../../devices/devices.types";
import { canSeeCustomerData, loadStaffScope } from "../common/staff";
import type { ConsoleDevice, Gateway, LogEntry, SmartHomeRow } from "../dashboard.types";
import { latestLogs } from "../logs/logs.repository";
import { getHomeSummary } from "../smart-homes/smartHomes.repository";
import { listGatewayRows, listNodeRows } from "./gateways.repository";

const EMPTY_COUNTS = { node_count: 0, paired_count: 0, device_count: 0 };

async function requireGateway(id: number): Promise<DeviceRow> {
  const row = await getDeviceRow(id);
  if (!row || row.device_type !== "gateway") throw notFound("Gateway not found");
  return row;
}

export async function listGateways(): Promise<Gateway[]> {
  const rows = await listGatewayRows();
  const counts = await getGatewayCounts(rows.map((row) => row.id));
  return rows.map((row) => toGateway(row, counts.get(row.id) ?? EMPTY_COUNTS));
}

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

/**
 * Gửi lệnh gateway. Factory-reset xoá cấu hình của khách nên Operator trên nhà đã claim phải có grant
 * (403 ACCESS_GRANT_REQUIRED); restart chỉ là thao tác vận hành nên không cần.
 */
export async function commandGateway(
  auth: AuthContext,
  id: number,
  action: GatewayAction,
  meta: RequestMeta
): Promise<{ command_id: string }> {
  const row = await requireGateway(id);
  if (action === "factory_reset" && row.home_id !== null && row.home_status !== null) {
    await requireOperatorHomeAccess(auth, { id: row.home_id, status: row.home_status });
  }
  const result = await sendGatewayCommand({ gatewayId: id, action, issuedBy: auth.userId, meta });
  return { command_id: result.commandId };
}
