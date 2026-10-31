// Chi tiết thiết bị trên console: DTO + 20 lệnh gần đây (chỉ khi được phép xem dữ liệu nhà).
import type { AuthContext } from "../../../../core/auth/auth-context";
import { canSeeCustomerData, loadStaffScope } from "../../../homes";
import { requireDevice } from "../../domain/console-access";
import { listRecentCommands } from "../../infrastructure/device-commands.read-model";
import { toConsoleDevice } from "../../infrastructure/device.read-model";

export async function getConsoleDeviceDetail(auth: AuthContext, id: number) {
  const row = await requireDevice(id);
  const scope = await loadStaffScope(auth);
  const visible = canSeeCustomerData(scope, { id: row.home_id, status: row.home_status });
  const dto = toConsoleDevice(row);
  return {
    device: visible ? dto : { ...dto, power: null },
    // Lịch sử lệnh là hoạt động của khách → chỉ khi được phép xem dữ liệu nhà
    recent_commands: visible ? await listRecentCommands(id, 20) : [],
  };
}
