// Tạo nhà từ KIT (FR-2.2): 1 nhà + các phòng + 1 gateway + các node/thiết bị theo mẫu.
//
// GỌI TRONG TRANSACTION CỦA NGƯỜI GỌI (invariant 9): hàm nhận `conn` đang ở trong
// withTransaction(); nếu bất kỳ INSERT nào lỗi, cả nhà bị rollback — "nothing persisted".
// Sau khi gọi, người gọi thường gọi tiếp issueActivationCode(conn, …) trong cùng transaction.
//
// Secret: mỗi thiết bị nhận secret_key = 32 byte ngẫu nhiên (hex) ghi thẳng vào DB. Kết quả trả về
// được đọc lại bằng listHomeDeviceRows của module devices (không có secret_key) — hàm KHÔNG BAO GIỜ trả hay log secret
// (invariant 1, 2). Firmware nhận secret qua quy trình sản xuất ngoài phạm vi backend.
import { randomSecretHex, generateUid } from "../../../shared/crypto";
import type { Queryable } from "../../../infrastructure/database/db";
import { insertDevice, listHomeDeviceRows } from "../../devices";
import { insertHome, insertRoom } from "../infrastructure/homes.repository";
import { getHomeRow } from "../infrastructure/home.read-model";
import { listRoomSummaries } from "../infrastructure/room.read-model";
import type { CreateKitHomeInput, KitHomeResult, KitNodeResult } from "./home.types";
import { KIT_FIRMWARE, KIT_TEMPLATES, UID_PREFIX } from "./kit-templates";

export async function createKitHome(conn: Queryable, input: CreateKitHomeInput): Promise<KitHomeResult> {
  const homeId = await insertHome(conn, {
    name: input.name,
    packageCode: input.packageCode,
    address: input.address ?? null,
    expectedOwnerName: input.expectedOwnerName ?? null,
    createdBy: input.createdBy,
  });

  const gatewayId = await insertDevice(conn, {
    uid: generateUid(UID_PREFIX.gateway),
    name: "Gateway trung tâm",
    deviceType: "gateway",
    category: "gateway",
    secret: randomSecretHex(32),
    homeId,
    roomId: null,
    gatewayDeviceId: null,
    nodeUid: null,
    powerState: null,
    firmwareVersion: KIT_FIRMWARE.gateway,
    location: null,
    simulated: input.simulated,
    createdBy: input.createdBy,
  });

  const nodes: KitNodeResult[] = [];
  const template = KIT_TEMPLATES[input.packageCode];
  for (const [index, room] of template.entries()) {
    const roomId = await insertRoom(conn, { homeId, name: room.roomName, roomType: room.roomType, sortOrder: index });
    // Mỗi phòng = 1 node vật lý; các thiết bị logic của phòng dùng chung node_uid
    const nodeUid = generateUid(UID_PREFIX.node);
    for (const device of room.devices) {
      await insertDevice(conn, {
        uid: generateUid(UID_PREFIX[device.category]),
        name: device.name,
        deviceType: "sensor", // danh tính node cho HMAC; loại chức năng ở `category`
        category: device.category,
        secret: randomSecretHex(32),
        homeId,
        roomId,
        gatewayDeviceId: gatewayId,
        nodeUid,
        powerState: device.category === "relay" ? false : null,
        firmwareVersion: KIT_FIRMWARE.node,
        location: room.roomName,
        simulated: input.simulated,
        createdBy: input.createdBy,
      });
    }
    nodes.push({
      node_uid: nodeUid,
      room_id: roomId,
      room_name: room.roomName,
      device_names: room.devices.map((device) => device.name),
    });
  }

  // Đọc lại trong cùng transaction: hình dạng giống mọi nơi khác, và chắc chắn không có secret_key
  const home = await getHomeRow(homeId, conn);
  const deviceRows = await listHomeDeviceRows(homeId, {}, conn);
  const gateway = deviceRows.find((row) => row.id === gatewayId);
  if (!home || !gateway) throw new Error("createKitHome: inserted rows could not be read back");

  return {
    home,
    rooms: await listRoomSummaries(homeId, { withClimate: false }, conn),
    gateway,
    devices: deviceRows.filter((row) => row.id !== gatewayId),
    nodes,
  };
}
