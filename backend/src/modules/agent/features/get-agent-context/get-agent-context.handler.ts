// GET /api/service/agent/homes/:homeId/context — ngữ cảnh nhà cho agent soạn kế hoạch (hợp đồng §2.2).
// Quyền: thành viên hiệu lực của nhà (không phải → 404). KHÔNG trả tên nhà, tên/email thành viên (agent chuyển cho LLM).
// `devices` chỉ gồm relay đèn/quạt/rèm/điều hoà mà người dùng XEM được (GUEST: thiết bị được cấp, còn hạn).
import type { AuthContext } from "../../../../core/auth/auth-context";
import { homeLocalParts } from "../../../../shared/time";
import { toCustomerDevices, listHomeDeviceRows } from "../../../devices";
import { listRoomSummaries, requireHomeMember } from "../../../homes";
import { isActionAllowed, isSchedulableDevice } from "../../../schedules";
import type { ScheduleAction } from "../../../schedules";
import { getRoomClimate } from "../../../telemetry";
import { formatLocalIso } from "../../domain/local-time";

const ALL_ACTIONS: readonly ScheduleAction[] = ["turn_on", "turn_off", "set_pos", "set_temp"];

export interface AgentContext {
  home: { id: number; timezone: string; local_now: string; iso_weekday: number; status: string };
  actor: { user_id: number; home_role: string };
  rooms: { id: number; name: string; climate: { temperature: number | null; humidity: number | null } | null }[];
  devices: {
    id: number;
    name: string;
    room_id: number | null;
    appliance: string;
    power: boolean;
    level: number | null;
    online: boolean;
    can_control: boolean;
    actions: ScheduleAction[];
  }[];
}

export async function getAgentContext(auth: AuthContext, homeId: number): Promise<AgentContext> {
  const access = await requireHomeMember(auth, homeId, "view");
  const now = new Date();
  const timezone = access.home.timezone;

  const [deviceRows, roomSummaries] = await Promise.all([
    listHomeDeviceRows(homeId, { includeGateway: false }),
    listRoomSummaries(homeId, { withClimate: false, deviceIds: access.guestDeviceIds }),
  ]);
  // Chỉ relay hẹn giờ được; toCustomerDevices tự lọc theo quyền xem (GUEST) và tính can_control theo vai trò
  const devices = (await toCustomerDevices(deviceRows.filter(isSchedulableDevice), access)).filter((device) => device.appliance !== null);
  // GUEST không thấy phòng chưa được cấp thiết bị nào (như get-home-overview)
  const rooms = access.guestDeviceIds === null ? roomSummaries : roomSummaries.filter((room) => room.device_count > 0);
  const climates = await Promise.all(rooms.map((room) => getRoomClimate(room.id, now)));

  return {
    home: {
      id: access.home.id,
      timezone,
      local_now: formatLocalIso(now, timezone),
      iso_weekday: homeLocalParts(now, timezone).isoWeekday,
      status: access.home.status,
    },
    actor: { user_id: auth.userId, home_role: access.role },
    rooms: rooms.map((room, i) => ({
      id: room.id,
      name: room.name,
      climate: climates[i].temperature === null && climates[i].humidity === null ? null : climates[i],
    })),
    devices: devices.map((device) => {
      const appliance = device.appliance as NonNullable<typeof device.appliance>;
      return {
        id: device.id,
        name: device.device_name,
        room_id: device.room_id,
        appliance,
        power: device.power === true,
        level: appliance === "curtain" ? device.curtain_pos : appliance === "ac" ? device.ac_setpoint : null,
        online: device.online,
        can_control: device.can_control,
        actions: device.can_control ? ALL_ACTIONS.filter((action) => isActionAllowed(appliance, action)) : [],
      };
    }),
  };
}
