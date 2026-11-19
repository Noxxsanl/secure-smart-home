// GET /smart-homes/:id — chi tiết nhà theo phạm vi Operator (FR-9.6, CONTRACT_V2 §5): ADMIN và nhà chưa claim
// xem đầy đủ; Operator với nhà đã claim cần grant, không có thì chỉ thấy dữ liệu "fleet" (sức khoẻ thiết bị).
import type { RequestMeta } from "../../../../core/http/request-meta";
import type { AuthContext } from "../../../../core/auth/auth-context";
import { listAutomationForHome } from "../../../automation";
import type { AutomationRuleDto } from "../../../automation";
import { getGatewayCounts, listHomeDeviceRows, toConsoleDevice, toGateway } from "../../../devices";
import { getCustomerByUserId } from "../../../identity";
import { auditOperatorHomeViewed, resolveOperatorAccess } from "../../domain/access-policy";
import type { ConsoleMember, TimelineEvent } from "../../domain/console-home.types";
import { requireHome, toDetailHome } from "../../domain/smart-home-detail";
import { getGrantById } from "../../infrastructure/operator-access.read-model";
import { listRoomSummaries } from "../../infrastructure/room.read-model";
import { listMembers, listTimeline } from "../../infrastructure/smart-homes.read-model";
import { getActivationInfo } from "../../infrastructure/smart-homes.repository";
import type { SmartHomeDetail } from "./get-smart-home-detail.dto";

export async function getSmartHomeDetail(auth: AuthContext, homeId: number, meta: RequestMeta): Promise<SmartHomeDetail> {
  const home = await requireHome(homeId);
  const access = await resolveOperatorAccess(auth, home);
  const withCustomerData = !access.restricted;

  const [detailHome, rooms, deviceRows, activation, ownerFull] = await Promise.all([
    toDetailHome(home),
    listRoomSummaries(home.id, { withClimate: withCustomerData }),
    listHomeDeviceRows(home.id),
    getActivationInfo(home.id),
    home.owner_user_id === null ? Promise.resolve(null) : getCustomerByUserId(home.owner_user_id),
  ]);

  const gatewayRow = deviceRows.find((row) => row.device_type === "gateway") ?? null;
  const counts = gatewayRow ? (await getGatewayCounts([gatewayRow.id])).get(gatewayRow.id) : undefined;
  // Operator chưa có grant: thiết bị chỉ giữ trường sức khoẻ — trạng thái bật/tắt relay là dữ liệu khách
  const devices = deviceRows
    .filter((row) => row.device_type !== "gateway")
    .map((row) => {
      const dto = toConsoleDevice(row);
      return withCustomerData ? dto : { ...dto, power: null };
    });

  let members: ConsoleMember[] = [];
  let rules: AutomationRuleDto[] = [];
  let timeline: TimelineEvent[] = [];
  if (withCustomerData) {
    [members, rules, timeline] = await Promise.all([
      listMembers(home.id),
      listAutomationForHome(auth, home.id),
      listTimeline(home.id, 50),
    ]);
    await auditOperatorHomeViewed(auth, home, access.grant, "chi tiết nhà", meta);
  }

  // Liên hệ khách (email/điện thoại/địa chỉ) cũng là dữ liệu khách → che khi bị giới hạn
  const owner = ownerFull && !withCustomerData ? { ...ownerFull, email: null, phone: null, address: null } : ownerFull;

  return {
    home: detailHome,
    owner,
    gateway: gatewayRow ? toGateway(gatewayRow, counts ?? { node_count: 0, paired_count: 0, device_count: 0 }) : null,
    rooms,
    devices,
    members,
    automation_rules: rules,
    timeline,
    activation,
    access: { restricted: access.restricted, grant: access.grant ? await getGrantById(access.grant.id) : null },
  };
}
