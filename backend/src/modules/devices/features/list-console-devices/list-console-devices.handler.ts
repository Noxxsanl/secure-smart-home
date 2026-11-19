// Danh sách thiết bị trên console (CONTRACT_V2 §5 Devices), lọc theo phạm vi Operator.
import type { AuthContext } from "../../../../core/auth/auth-context";
import { canSeeCustomerData, loadStaffScope } from "../../../homes";
import type { ConsoleDevice } from "../../domain/device.types";
import { listDevices, type DeviceListFilter } from "../../infrastructure/console-devices.repository";
import { toConsoleDevice } from "../../infrastructure/device.read-model";

export async function listConsoleDevices(auth: AuthContext, filter: DeviceListFilter): Promise<ConsoleDevice[]> {
  const [rows, scope] = await Promise.all([listDevices(filter), loadStaffScope(auth)]);
  // Trạng thái bật/tắt relay của nhà đã claim là dữ liệu khách: che khi Operator chưa có grant
  return rows.map((row) => {
    const dto = toConsoleDevice(row);
    return canSeeCustomerData(scope, { id: row.home_id, status: row.home_status }) ? dto : { ...dto, power: null };
  });
}
