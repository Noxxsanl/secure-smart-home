import type { DeviceCategory, PackageCode, RoomType } from "@smarthome/console/api/types";

// Template gói (hợp đồng V2 §5, FR-2.2) — CHỈ dùng để xem trước ở bước 1 của
// wizard. Dữ liệu thật (phòng, UID, thiết bị) luôn lấy từ response của
// POST /smart-homes do backend sinh trong một transaction.

export type TemplateRoom = {
  room_type: RoomType;
  name: string;
  node: string;
  devices: { category: Exclude<DeviceCategory, "gateway">; name: string }[];
};

const KIT_A_ROOMS: TemplateRoom[] = [
  { room_type: "door", name: "Cửa chính", node: "ND1", devices: [{ category: "door_contact", name: "Cảm biến cửa chính" }] },
  {
    room_type: "living_room", name: "Phòng khách", node: "ND2",
    devices: [{ category: "sensor", name: "Cảm biến nhiệt/ẩm phòng khách" }, { category: "relay", name: "Đèn phòng khách" }],
  },
  {
    room_type: "bedroom", name: "Phòng ngủ", node: "ND3",
    devices: [{ category: "sensor", name: "Cảm biến nhiệt/ẩm phòng ngủ" }, { category: "relay", name: "Quạt phòng ngủ" }],
  },
  {
    room_type: "kitchen", name: "Nhà bếp", node: "ND4",
    devices: [{ category: "sensor", name: "Cảm biến nhiệt/ẩm nhà bếp" }, { category: "relay", name: "Đèn nhà bếp" }],
  },
];

const KIT_B_ROOMS: TemplateRoom[] = [
  {
    ...KIT_A_ROOMS[0],
    devices: [...KIT_A_ROOMS[0].devices, { category: "camera", name: "Camera cửa chính" }],
  },
  ...KIT_A_ROOMS.slice(1),
  {
    room_type: "office", name: "Phòng làm việc", node: "ND5",
    devices: [{ category: "sensor", name: "Cảm biến nhiệt/ẩm phòng làm việc" }, { category: "relay", name: "Đèn phòng làm việc" }],
  },
];

export const PACKAGE_TEMPLATES: Record<PackageCode, { title: string; description: string; rooms: TemplateRoom[] }> = {
  KIT_A: {
    title: "KIT_A — Gói cơ bản",
    description: "Cửa chính, phòng khách, phòng ngủ, nhà bếp.",
    rooms: KIT_A_ROOMS,
  },
  KIT_B: {
    title: "KIT_B — Gói mở rộng",
    description: "KIT_A + camera cửa chính + phòng làm việc.",
    rooms: KIT_B_ROOMS,
  },
};

export function templateSummary(pkg: PackageCode) {
  const rooms = PACKAGE_TEMPLATES[pkg].rooms;
  return {
    rooms: rooms.length,
    gateways: 1,
    nodes: rooms.length,
    devices: rooms.reduce((sum, r) => sum + r.devices.length, 0),
  };
}
