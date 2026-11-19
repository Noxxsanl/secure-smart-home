// POST /smart-homes/register-gateway — Admin/Operator đăng ký phần cứng THẬT (gateway + node cảm biến + camera, đã nạp
// device_id/secret vào NVS) cho một tài khoản khách hàng bất kỳ. Thay cho công cụ dev `npm run hw:register` (cùng mô
// hình thiết bị, xem domain/gateway-registration.ts).
//
// Nhà + thành viên OWNER + phòng + thiết bị ghi trong MỘT transaction (invariant 9); audit/thông báo SAU commit.
// Idempotent: nhà cùng tên của khách được dùng lại, thiết bị upsert theo device_id (cập nhật secret, mở khoá).
// Quyền:
//   - ADMIN: mọi khách, mọi nhà; được chuyển thiết bị đang thuộc nhà khác (transfer = true, xoá kèm dữ liệu cũ; chuyển
//     gateway thì chuyển cả nhóm — mọi thiết bị đang nối qua gateway đó ở nhà cũ cũng bị xoá khỏi nhà cũ).
//   - OPERATOR: tạo nhà mới cho khách; thêm vào nhà khách ĐÃ CÓ cần grant còn hiệu lực (FR-9.6); không được chuyển
//     thiết bị giữa các nhà (thao tác xoá dữ liệu khách — giống xoá thiết bị, chỉ ADMIN).
// Secret chỉ đi từ request vào cột devices.secret_key: không trả về, không log, không đưa vào details (invariant 1, 2).
import type { AuthContext } from "../../../../core/auth/auth-context";
import type { RequestMeta } from "../../../../core/http/request-meta";
import { withTransaction } from "../../../../infrastructure/database/db";
import { randomSecretHex } from "../../../../shared/crypto";
import { HttpError } from "../../../../shared/errors/http-error";
import { eventBus } from "../../../../shared/events/event-bus";
import { logEvent } from "../../../audit";
import {
  deleteDevicesForTransfer,
  findDevicesByUids,
  findGatewayChildren,
  upsertHardwareDevice,
  upsertNodeAppliance,
  type ExistingDeviceRef,
} from "../../../devices";
import { findActiveCustomerById } from "../../../identity";
import { notifyUser } from "../../../notifications";
import { requireOperatorHomeAccess } from "../../domain/access-policy";
import {
  DEFAULT_ROOM,
  GATEWAY_DEFAULT_NAME,
  NODE_APPLIANCES,
  applianceName,
  applianceUid,
  cameraName,
  sensorName,
  type HardwareNodeKind,
} from "../../domain/gateway-registration";
import { insertOwnerMember } from "../../infrastructure/activation.repository";
import { getHomeRow } from "../../infrastructure/home.read-model";
import {
  findOwnedHomeByName,
  findRoomByName,
  getRoomRow,
  insertOwnedHome,
  insertRoom,
  lockCustomerHomes,
  nextRoomSortOrder,
} from "../../infrastructure/homes.repository";
import type { RegisterGatewayInput, RegisterGatewayResult, RegisteredDevice } from "./register-gateway.dto";

/** Mọi device_id sẽ ghi (gateway, node, camera, relay của node) — không được trùng nhau trong một lần đăng ký. */
function collectUids(input: RegisterGatewayInput): string[] {
  const uids = [input.gateway.uid];
  for (const node of input.nodes) {
    uids.push(node.uid);
    if (node.kind === "node") uids.push(...NODE_APPLIANCES.map((item) => applianceUid(node.uid, item.appliance)));
  }
  const seen = new Set<string>();
  for (const uid of uids) {
    if (seen.has(uid)) throw new HttpError(400, "DUPLICATE_DEVICE_ID", "device_id values must be unique");
    seen.add(uid);
  }
  return uids;
}

/** Dòng của nhà khác vừa xuất hiện giữa lúc kiểm tra và lúc ghi (đăng ký song song) → 409, rollback cả lượt. */
function concurrentConflict(uid: string): HttpError {
  return new HttpError(409, "DEVICE_IN_OTHER_HOME", "A device was registered to another home concurrently", {
    device_id: uid,
    home_name: null,
    count: 1,
  });
}

export async function registerGateway(
  auth: AuthContext,
  input: RegisterGatewayInput,
  meta: RequestMeta
): Promise<RegisterGatewayResult> {
  const uids = collectUids(input);
  const customer = await findActiveCustomerById(input.customerId);
  if (!customer) throw new HttpError(404, "CUSTOMER_NOT_FOUND", "Customer not found");

  const outcome = await withTransaction(async (conn) => {
    // Hai lượt song song cho cùng khách không tạo hai nhà trùng tên
    await lockCustomerHomes(conn, customer.user_id);
    const existingHome = await findOwnedHomeByName(conn, customer.user_id, input.homeName);
    // Thêm thiết bị vào nhà khách đang dùng = ghi dữ liệu khách → Operator cần grant như mọi thao tác khác (FR-9.6)
    if (existingHome && auth.role !== "admin") await requireOperatorHomeAccess(auth, existingHome);

    // Thiết bị đã thuộc NHÀ KHÁC: dừng (409) trừ khi ADMIN xác nhận chuyển. Các dòng bị khoá FOR UPDATE.
    const inOtherHome = (device: ExistingDeviceRef): boolean => device.home_id !== null && device.home_id !== existingHome?.id;
    const existing = await findDevicesByUids(conn, uids);
    const direct = existing.filter(inOtherHome);
    // Chuyển gateway = chuyển cả nhóm: node/camera/relay còn nối qua gateway đó ở nhà cũ không hoạt động được nữa
    const directIds = new Set(direct.map((device) => device.id));
    const children = (await findGatewayChildren(conn, direct.filter((d) => d.category === "gateway").map((d) => d.id)))
      .filter((device) => inOtherHome(device) && !directIds.has(device.id));
    const conflicts = [...direct, ...children];
    if (conflicts.length > 0) {
      if (!input.transfer) {
        const first = conflicts[0];
        // Tên nhà của khách khác chỉ cho ADMIN — Operator không dò được thiết bị nằm ở nhà nào (FR-9.6)
        const other = auth.role === "admin" && first.home_id !== null ? await getHomeRow(first.home_id, conn) : null;
        throw new HttpError(409, "DEVICE_IN_OTHER_HOME", "Some devices already belong to another home", {
          device_id: first.device_id,
          home_name: other?.name ?? null,
          count: conflicts.length,
        });
      }
      if (auth.role !== "admin") throw new HttpError(403, "TRANSFER_REQUIRES_ADMIN", "Only admins can move devices");
      await deleteDevicesForTransfer(conn, conflicts.map((device) => device.id));
    }
    const conflictIds = new Set(conflicts.map((device) => device.id));
    const kept = new Map<string, ExistingDeviceRef>(
      existing.filter((device) => !conflictIds.has(device.id)).map((device) => [device.device_id, device])
    );

    // Nhà: dùng lại nhà cùng tên của khách, hoặc tạo mới đã có chủ (OWNER) — cùng trạng thái cuối với claim
    let homeId: number;
    if (existingHome) {
      homeId = existingHome.id;
    } else {
      homeId = await insertOwnedHome(conn, { name: input.homeName, ownerUserId: customer.user_id, createdBy: auth.userId });
      await insertOwnerMember(conn, homeId, customer.user_id);
    }

    // Phòng: thiết bị đã ở nhà này giữ phòng hiện tại (khách có thể đã đổi tên phòng); còn lại tìm theo tên hoặc tạo
    const roomNames = new Map<number, string>();
    async function resolveRoom(kind: HardwareNodeKind, roomName: string, current?: ExistingDeviceRef): Promise<number> {
      if (current?.home_id === homeId && current.room_id !== null) {
        const room = await getRoomRow(current.room_id, conn);
        if (room && room.home_id === homeId) {
          roomNames.set(room.id, room.name);
          return room.id;
        }
      }
      let roomId = await findRoomByName(conn, homeId, roomName);
      if (roomId === null) {
        roomId = await insertRoom(conn, {
          homeId,
          name: roomName,
          roomType: DEFAULT_ROOM[kind].type,
          sortOrder: await nextRoomSortOrder(conn, homeId),
        });
      }
      if (!roomNames.has(roomId)) roomNames.set(roomId, (await getRoomRow(roomId, conn))?.name ?? roomName);
      return roomId;
    }

    const devices: RegisteredDevice[] = [];
    const unblocked = (uid: string): boolean => kept.get(uid)?.status === "blocked";

    const gateway = await upsertHardwareDevice(conn, {
      uid: input.gateway.uid,
      name: GATEWAY_DEFAULT_NAME,
      deviceType: "gateway",
      category: "gateway",
      secret: input.gateway.secret,
      homeId,
      roomId: null,
      location: null,
      gatewayDeviceId: null,
      createdBy: auth.userId,
    });
    if (!gateway) throw concurrentConflict(input.gateway.uid);
    devices.push({
      id: gateway.id,
      device_id: input.gateway.uid,
      device_name: gateway.device_name,
      category: "gateway",
      room_name: null,
      is_simulated: false,
      unblocked: unblocked(input.gateway.uid),
    });

    let cameraIndex = 0;
    for (const node of input.nodes) {
      const roomId = await resolveRoom(node.kind, node.roomName, kept.get(node.uid));
      const roomName = roomNames.get(roomId) ?? node.roomName;
      const isCamera = node.kind === "camera";
      const row = await upsertHardwareDevice(conn, {
        uid: node.uid,
        name: isCamera ? cameraName(cameraIndex++) : sensorName(roomName),
        deviceType: "sensor",
        category: isCamera ? "camera" : "sensor",
        secret: node.secret,
        homeId,
        roomId,
        location: roomName,
        gatewayDeviceId: gateway.id,
        createdBy: auth.userId,
      });
      if (!row) throw concurrentConflict(node.uid);
      devices.push({
        id: row.id,
        device_id: node.uid,
        device_name: row.device_name,
        category: isCamera ? "camera" : "sensor",
        room_name: roomName,
        is_simulated: false,
        unblocked: unblocked(node.uid),
      });
      if (isCamera) continue;

      // Đèn, quạt (relay), rèm (động cơ bước), điều hoà (IR) của node cảm biến — đều là thiết bị thật do Node điều khiển
      for (const item of NODE_APPLIANCES) {
        const uid = applianceUid(node.uid, item.appliance);
        const appliance = await upsertNodeAppliance(conn, {
          uid,
          appliance: item.appliance,
          name: applianceName(item.label, roomName),
          simulated: item.simulated,
          // Cột NOT NULL; relay không tự ký gì (lệnh ký bằng secret gateway) và secret này không bao giờ ra ngoài
          secret: randomSecretHex(32),
          homeId,
          roomId,
          location: roomName,
          gatewayDeviceId: gateway.id,
          createdBy: auth.userId,
        });
        if (!appliance) throw concurrentConflict(uid);
        devices.push({
          id: appliance.id,
          device_id: uid,
          device_name: appliance.device_name,
          category: "relay",
          room_name: roomName,
          is_simulated: appliance.is_simulated,
          unblocked: false,
        });
      }
    }

    const transferredFrom = [...new Set(conflicts.map((device) => device.home_id).filter((id): id is number => id !== null))];
    return { homeId, created: existingHome === null, devices, gatewayId: gateway.id, transferredFrom };
  });

  // ── Sau commit: audit + thông báo + làm mới client (lỗi ở đây không làm mất dữ liệu đã ghi) ──
  const homeLabel = `"${input.homeName}"`;
  const owner = `${customer.name} (${customer.user_tag})`;
  if (outcome.created) {
    await logEvent({
      eventType: "HOME_CREATED",
      homeId: outcome.homeId,
      actorUserId: auth.userId,
      message: `${auth.username} tạo nhà ${homeLabel} cho ${owner} khi đăng ký gateway`,
      ip: meta.ip,
      userAgent: meta.userAgent,
      details: { customer_id: customer.id, gateway: input.gateway.uid },
    });
  }
  await logEvent({
    eventType: "DEVICE_REGISTER",
    homeId: outcome.homeId,
    deviceId: outcome.gatewayId,
    actorUserId: auth.userId,
    message: `${auth.username} đăng ký gateway ${input.gateway.uid} (${outcome.devices.length} thiết bị) cho nhà ${homeLabel} của ${owner}`,
    ip: meta.ip,
    userAgent: meta.userAgent,
    details: {
      customer_id: customer.id,
      gateway: input.gateway.uid,
      nodes: input.nodes.map((node) => ({ kind: node.kind, device_id: node.uid })),
      device_count: outcome.devices.length,
      transferred_from_home_ids: outcome.transferredFrom,
    },
  });
  for (const oldHomeId of outcome.transferredFrom) {
    await logEvent({
      eventType: "DEVICE_DELETE",
      homeId: oldHomeId,
      actorUserId: auth.userId,
      message: `${auth.username} chuyển thiết bị của gateway ${input.gateway.uid} sang nhà ${homeLabel} của ${owner}`,
      ip: meta.ip,
      userAgent: meta.userAgent,
      details: { to_home_id: outcome.homeId },
    });
    eventBus.emit("home_changed", { home_id: oldHomeId });
    // Báo chủ nhà cũ (nếu có) — thiết bị biến mất khỏi nhà của họ
    const oldHome = await getHomeRow(oldHomeId);
    if (oldHome?.owner_user_id != null && oldHome.owner_user_id !== customer.user_id) {
      await notifyUser({
        userId: oldHome.owner_user_id,
        homeId: oldHomeId,
        type: "DEVICE_REMOVED",
        title: "Thiết bị đã được chuyển đi",
        message: `Gateway ${input.gateway.uid} và các thiết bị nối qua nó đã được quản trị viên chuyển khỏi nhà "${oldHome.name}".`,
        severity: "warning",
      });
    }
  }
  await notifyUser({
    userId: customer.user_id,
    homeId: outcome.homeId,
    type: outcome.created ? "HOME_CLAIMED" : "DEVICE_ADDED",
    title: outcome.created ? "Nhà mới đã sẵn sàng" : "Thiết bị đã được cập nhật",
    message: outcome.created
      ? `Nhà ${homeLabel} cùng gateway và thiết bị đã được đăng ký cho bạn. Bạn là chủ nhà.`
      : `Gateway và thiết bị của nhà ${homeLabel} vừa được đăng ký/cập nhật.`,
    severity: "success",
  });
  eventBus.emit("home_changed", { home_id: outcome.homeId });

  return {
    home: { id: outcome.homeId, name: input.homeName, created: outcome.created },
    owner: { customer_id: customer.id, name: customer.name, user_tag: customer.user_tag, email: customer.email },
    devices: outcome.devices,
    transferred_from_home_ids: outcome.transferredFrom,
  };
}
