// Mẫu KIT (CONTRACT_V2 §5, FR-2.2): mỗi gói tạo sẵn phòng + node + thiết bị.
//   KIT_A = 4 phòng, 1 gateway, 4 node, 7 thiết bị.
//   KIT_B = 5 phòng, 1 gateway, 5 node, 10 thiết bị (KIT_A + camera cửa chính + Phòng làm việc).
// Tên tiếng Việt là dữ liệu hiển thị cho khách — đổi ở đây là đổi cho mọi nhà tạo mới.
import type { PackageCode } from "../../../shared/types/domain";
import type { KitRoomTemplate } from "./home.types";

const KIT_A_ROOMS: readonly KitRoomTemplate[] = [
  {
    roomType: "door",
    roomName: "Cửa chính",
    nodeLabel: "ND1",
    devices: [{ category: "door_contact", name: "Cảm biến cửa chính" }],
  },
  {
    roomType: "living_room",
    roomName: "Phòng khách",
    nodeLabel: "ND2",
    devices: [
      { category: "sensor", name: "Cảm biến nhiệt/ẩm phòng khách" },
      { category: "relay", name: "Đèn phòng khách" },
    ],
  },
  {
    roomType: "bedroom",
    roomName: "Phòng ngủ",
    nodeLabel: "ND3",
    devices: [
      { category: "sensor", name: "Cảm biến nhiệt/ẩm phòng ngủ" },
      { category: "relay", name: "Quạt phòng ngủ" },
    ],
  },
  {
    roomType: "kitchen",
    roomName: "Nhà bếp",
    nodeLabel: "ND4",
    devices: [
      { category: "sensor", name: "Cảm biến nhiệt/ẩm nhà bếp" },
      { category: "relay", name: "Đèn nhà bếp" },
    ],
  },
];

const KIT_B_ROOMS: readonly KitRoomTemplate[] = [
  // Phòng "Cửa chính" của KIT_B có thêm camera trên cùng node ND1
  {
    ...KIT_A_ROOMS[0],
    devices: [...KIT_A_ROOMS[0].devices, { category: "camera", name: "Camera cửa chính" }],
  },
  ...KIT_A_ROOMS.slice(1),
  {
    roomType: "office",
    roomName: "Phòng làm việc",
    nodeLabel: "ND5",
    devices: [
      { category: "sensor", name: "Cảm biến nhiệt/ẩm phòng làm việc" },
      { category: "relay", name: "Đèn phòng làm việc" },
    ],
  },
];

export const KIT_TEMPLATES: Readonly<Record<PackageCode, readonly KitRoomTemplate[]>> = {
  KIT_A: KIT_A_ROOMS,
  KIT_B: KIT_B_ROOMS,
};

/** Tiền tố UID theo loại thiết bị: UID = prefix + 12 hex HOA (shared/crypto.generateUid). */
export const UID_PREFIX = {
  gateway: "ESP32-GW-",
  node: "ESP32-ND-",
  sensor: "ESP32-SN-",
  relay: "ESP32-RL-",
  door_contact: "ESP32-DC-",
  camera: "ESP32-CM-",
} as const;

/** Phiên bản firmware gán cho thiết bị mới tạo (CONTRACT §5). */
export const KIT_FIRMWARE = { gateway: "2.3.1", node: "1.4.0" } as const;
