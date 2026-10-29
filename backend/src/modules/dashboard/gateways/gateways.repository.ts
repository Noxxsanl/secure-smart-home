// SQL gateway cho console: danh sách gateway, node của gateway.
import { queryRows } from "../../../lib/db";
import { DEVICE_SELECT_SQL } from "../../devices/deviceReadModel";
import type { DeviceRow } from "../../devices/devices.types";

export async function listGatewayRows(): Promise<DeviceRow[]> {
  return queryRows<DeviceRow>(`${DEVICE_SELECT_SQL} WHERE d.device_type = 'gateway' ORDER BY d.id`);
}

/** Thiết bị (node) thuộc gateway, theo phòng. */
export async function listNodeRows(gatewayId: number): Promise<DeviceRow[]> {
  return queryRows<DeviceRow>(
    `${DEVICE_SELECT_SQL} WHERE d.gateway_device_id = ? ORDER BY r.sort_order NULLS FIRST, d.room_id NULLS FIRST, d.id`,
    [gatewayId]
  );
}
