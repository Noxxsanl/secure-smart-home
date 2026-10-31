// Danh sách gateway trên console (FR-9.1).
import { EMPTY_COUNTS } from "../../domain/gateway-counts";
import type { Gateway } from "../../domain/device.types";
import { getGatewayCounts, toGateway } from "../../infrastructure/device.read-model";
import { listGatewayRows } from "../../infrastructure/gateways.repository";

export async function listGateways(): Promise<Gateway[]> {
  const rows = await listGatewayRows();
  const counts = await getGatewayCounts(rows.map((row) => row.id));
  return rows.map((row) => toGateway(row, counts.get(row.id) ?? EMPTY_COUNTS));
}
