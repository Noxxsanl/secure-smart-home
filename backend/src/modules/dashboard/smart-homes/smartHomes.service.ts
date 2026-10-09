// Nghiệp vụ Smart Homes của console (CONTRACT_V2 §5): tạo nhà từ KIT (1 transaction), chi tiết theo
// phạm vi Operator (FR-9.6), sửa nhà, gán chủ nhà, mã kích hoạt, xin quyền khẩn cấp.
import { env } from "../../../config/env";
import type { RequestMeta } from "../../../lib/clientIp";
import { HttpError, forbidden, notFound } from "../../../lib/http";
import { eventBus } from "../../../lib/eventBus";
import { withTransaction } from "../../../lib/db";
import { auditOperatorHomeViewed, resolveOperatorAccess } from "../../access/access.service";
import type { AuthContext } from "../../auth/auth.types";
import { getGatewayCounts, listHomeDeviceRows, toConsoleDevice, toGateway } from "../../devices/deviceReadModel";
import { assignOwner, issueActivationCode, revokeActivationCodes } from "../../homes/activation.service";
import { toHome } from "../../homes/homes.mapper";
import { getHomeRow, listRoomSummaries } from "../../homes/homes.repository";
import type { ActivationCodeIssued, HomeRow } from "../../homes/homes.types";
import { createKitHome } from "../../homes/provisioning.service";
import { logEvent } from "../../logs/logEvent";
import { notifyHomeMembers, notifyUser } from "../../notifications/notification.service";
import type { PackageCode } from "../../../types/domain";
import { listAutomationForHome } from "../automation/automation.service";
import {
  findActiveCustomerById,
  findCustomerByTag,
  getCustomerByUserId,
} from "../customers/customers.repository";
import { getGrantById } from "../operator-access/operatorAccess.repository";
import { selfServiceGrant } from "../operator-access/operatorAccess.service";
import type {
  ConsoleDevice,
  Customer,
  Gateway,
  OperatorAccessGrant,
  SmartHomeDetailHome,
  SmartHomeRow,
} from "../dashboard.types";
import type {
  AutomationRuleDto,
  ConsoleMember,
  ConsoleRoom,
  HomeActivationInfo,
  TimelineEvent,
} from "../dashboard.types";
import {
  getActivationInfo,
  getHomeExtras,
  insertActivationLog,
  listHomeRows,
  listMembers,
  listTimeline,
  updateHome,
  type HomeListFilter,
  type HomePatch,
} from "./smartHomes.repository";

export interface ProvisionResult {
  home: SmartHomeDetailHome;
  rooms: ConsoleRoom[];
  gateway: Gateway;
  devices: ConsoleDevice[];
  nodes: { node_uid: string; room_id: number; room_name: string; device_names: string[] }[];
  activation: ActivationCodeIssued;
}

export interface SmartHomeDetail {
  home: SmartHomeDetailHome;
  owner: Customer | null;
  gateway: Gateway | null;
  rooms: ConsoleRoom[];
  devices: ConsoleDevice[];
  members: ConsoleMember[];
  automation_rules: AutomationRuleDto[];
  timeline: TimelineEvent[];
  activation: HomeActivationInfo;
  access: { restricted: boolean; grant: OperatorAccessGrant | null };
}

async function toDetailHome(row: HomeRow): Promise<SmartHomeDetailHome> {
  const extras = await getHomeExtras(row.id);
  return { ...toHome(row), ...extras, expected_owner_name: row.expected_owner_name };
}

async function requireHome(id: number): Promise<HomeRow> {
  const home = await getHomeRow(id);
  if (!home) throw notFound("Home not found");
  return home;
}

export async function listSmartHomes(filter: HomeListFilter): Promise<SmartHomeRow[]> {
  return listHomeRows(filter);
}

// ── Tạo nhà (FR-2.2, FR-2.3) ───────────────────────────────────────────────

export async function createSmartHome(
  auth: AuthContext,
  input: { name: string; packageCode: PackageCode; address?: string; expectedOwnerName?: string },
  meta: RequestMeta
): Promise<ProvisionResult> {
  // Nhà + phòng + gateway + thiết bị + mã kích hoạt: một transaction — lỗi ở đâu cũng không còn gì
  const { kit, activation } = await withTransaction(async (conn) => {
    const created = await createKitHome(conn, {
      name: input.name,
      packageCode: input.packageCode,
      address: input.address ?? null,
      expectedOwnerName: input.expectedOwnerName ?? null,
      createdBy: auth.userId,
      simulated: env.deviceSimulator,
    });
    const issued = await issueActivationCode(conn, { homeId: created.home.id, createdBy: auth.userId });
    return { kit: created, activation: issued };
  });

  // Audit SAU commit; details không chứa mã kích hoạt (invariant 2)
  await logEvent({
    eventType: "HOME_CREATED",
    homeId: kit.home.id,
    actorUserId: auth.userId,
    message: `${auth.username} tạo nhà "${kit.home.name}" (${kit.home.package_code})`,
    ip: meta.ip,
    userAgent: meta.userAgent,
    details: { package: kit.home.package_code, rooms: kit.rooms.length, devices: kit.devices.length + 1 },
  });
  await logEvent({
    eventType: "ACTIVATION_CODE_CREATED",
    homeId: kit.home.id,
    actorUserId: auth.userId,
    message: `Tạo mã kích hoạt cho nhà "${kit.home.name}"`,
    ip: meta.ip,
    userAgent: meta.userAgent,
    details: { expires_at: activation.expires_at },
  });

  const counts = (await getGatewayCounts([kit.gateway.id])).get(kit.gateway.id) ?? {
    node_count: 0,
    paired_count: 0,
    device_count: 0,
  };
  return {
    home: await toDetailHome(kit.home),
    rooms: kit.rooms,
    gateway: toGateway(kit.gateway, counts),
    devices: kit.devices.map(toConsoleDevice),
    nodes: kit.nodes,
    activation,
  };
}

// ── Chi tiết (FR-9.6) ──────────────────────────────────────────────────────

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

// ── Sửa nhà ────────────────────────────────────────────────────────────────

export async function patchSmartHome(
  auth: AuthContext,
  homeId: number,
  patch: HomePatch,
  meta: RequestMeta
): Promise<SmartHomeDetailHome> {
  const home = await requireHome(homeId);

  if (patch.name !== undefined || patch.address !== undefined) {
    // ADMIN sửa mọi nhà; OPERATOR chỉ nhà chưa claim (nhà đã có chủ là dữ liệu khách)
    if (auth.role !== "admin" && home.status !== "unclaimed") throw forbidden("Operators may only edit unclaimed homes");
  }
  if (patch.status !== undefined) {
    if (auth.role !== "admin") throw forbidden("Only admins can change home status");
    if (home.status === "unclaimed") throw new HttpError(409, "HOME_NOT_CLAIMED", "Unclaimed homes cannot be suspended or activated");
  }

  await updateHome(homeId, patch);

  if (patch.name !== undefined && patch.name !== home.name) {
    await logEvent({
      eventType: "HOME_RENAMED",
      homeId,
      actorUserId: auth.userId,
      message: `${auth.username} đổi tên nhà "${home.name}" thành "${patch.name}"`,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
  }
  if (patch.status !== undefined && patch.status !== home.status) {
    const suspended = patch.status === "suspended";
    await logEvent({
      eventType: "HOME_STATUS_CHANGED",
      homeId,
      actorUserId: auth.userId,
      message: suspended
        ? `${auth.username} tạm ngưng nhà "${home.name}"`
        : `${auth.username} mở lại hoạt động nhà "${home.name}"`,
      ip: meta.ip,
      userAgent: meta.userAgent,
      details: { from: home.status, to: patch.status },
    });
    await notifyHomeMembers({
      homeId,
      type: "HOME_STATUS",
      title: suspended ? "Nhà của bạn đã bị tạm ngưng" : "Nhà của bạn đã hoạt động trở lại",
      message: suspended
        ? `Nhà "${home.name}" đang bị tạm ngưng nên bạn chưa thể điều khiển thiết bị. Vui lòng liên hệ hỗ trợ.`
        : `Nhà "${home.name}" đã được mở lại, bạn có thể tiếp tục sử dụng bình thường.`,
      severity: suspended ? "warning" : "success",
    });
  }
  eventBus.emit("home_changed", { home_id: homeId });

  return toDetailHome(await requireHome(homeId));
}

// ── Gán chủ nhà (FR-3.x, operator_assign) ──────────────────────────────────

export async function assignHomeOwner(
  auth: AuthContext,
  homeId: number,
  target: { userTag?: string; customerId?: number },
  meta: RequestMeta
): Promise<SmartHomeDetailHome> {
  const home = await requireHome(homeId);
  if (home.status !== "unclaimed") throw new HttpError(409, "ALREADY_CLAIMED", "Home has already been claimed");

  const customer =
    target.customerId !== undefined
      ? await findActiveCustomerById(target.customerId)
      : target.userTag !== undefined
        ? await findCustomerByTag(target.userTag)
        : null;
  if (!customer) throw new HttpError(404, "CUSTOMER_NOT_FOUND", "Customer not found");

  // Cùng cơ chế race-safe với claim: nhà + mã + thành viên OWNER + activation_logs trong một transaction
  await withTransaction(async (conn) => {
    await assignOwner(conn, {
      homeId,
      userId: customer.user_id,
      actorUserId: auth.userId,
      conflictCode: "ALREADY_CLAIMED",
    });
    await insertActivationLog(conn, {
      homeId,
      userId: customer.user_id,
      method: "operator_assign",
      result: "success",
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
  });

  await logEvent({
    eventType: "OWNER_ASSIGNED",
    homeId,
    actorUserId: auth.userId,
    message: `${auth.username} gán ${customer.name} (${customer.user_tag}) làm chủ nhà "${home.name}"`,
    ip: meta.ip,
    userAgent: meta.userAgent,
    details: { customer_id: customer.id },
  });
  await notifyUser({
    userId: customer.user_id,
    homeId,
    type: "HOME_CLAIMED",
    title: "Bạn đã trở thành chủ nhà",
    message: `Nhà "${home.name}" đã được gán cho bạn. Bạn có thể bắt đầu quản lý thiết bị ngay.`,
    severity: "success",
  });
  eventBus.emit("home_changed", { home_id: homeId });

  return toDetailHome(await requireHome(homeId));
}

// ── Mã kích hoạt (FR-2.4, 2.6) ─────────────────────────────────────────────

export async function createActivationCode(auth: AuthContext, homeId: number, meta: RequestMeta): Promise<ActivationCodeIssued> {
  const home = await requireHome(homeId);
  const issued = await withTransaction((conn) => issueActivationCode(conn, { homeId, createdBy: auth.userId }));
  await logEvent({
    eventType: "ACTIVATION_CODE_CREATED",
    homeId,
    actorUserId: auth.userId,
    message: `${auth.username} tạo lại mã kích hoạt cho nhà "${home.name}"`,
    ip: meta.ip,
    userAgent: meta.userAgent,
    details: { expires_at: issued.expires_at },
  });
  return issued;
}

export async function revokeActivation(auth: AuthContext, homeId: number, meta: RequestMeta): Promise<void> {
  const home = await requireHome(homeId);
  const revoked = await withTransaction((conn) => revokeActivationCodes(conn, homeId, auth.userId));
  if (revoked === 0) return; // không có mã nào đang hiệu lực: idempotent, không ghi audit
  await logEvent({
    eventType: "ACTIVATION_CODE_REVOKED",
    homeId,
    actorUserId: auth.userId,
    message: `${auth.username} thu hồi mã kích hoạt của nhà "${home.name}"`,
    ip: meta.ip,
    userAgent: meta.userAgent,
    details: { revoked },
  });
}

// ── Xin quyền khẩn cấp (FR-9.6) ────────────────────────────────────────────

export async function requestHomeAccess(
  auth: AuthContext,
  homeId: number,
  input: { reason: string; durationHours: number },
  meta: RequestMeta
): Promise<OperatorAccessGrant> {
  return selfServiceGrant(auth, { homeId, reason: input.reason, durationHours: input.durationHours }, meta);
}
