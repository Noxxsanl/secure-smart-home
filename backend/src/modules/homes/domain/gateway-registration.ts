// Mô hình phần cứng thật khi Admin/Operator đăng ký gateway cho khách (features/register-gateway) — cùng mô hình với
// công cụ dev scripts/register-hardware.ts: 1 gateway + các node cảm biến nhiệt/ẩm và camera đã nạp device_id/secret.
// Mỗi node cảm biến kèm 4 thiết bị điều khiển của phòng (màn hình TFT của Node đọc cùng 4 trường lamp/fan/curtain/ac),
// cả 4 là thiết bị THẬT do Node điều khiển — đèn/quạt qua relay, rèm qua động cơ bước, điều hoà qua IR; lệnh đi MQTT →
// gateway → Node (ESP-NOW, params.target = hậu tố). device_id của chúng = "<device_id node>-<appliance>" và cột
// devices.appliance = hậu tố — ingest dựa vào cặp này để đồng bộ trạng thái từ telemetry của Node. Tên chứa từ khoá ("Đèn",
// "Quạt", "Rèm", "Điều hòa") để web/mobile chọn đúng kiểu điều khiển.
import type { Appliance } from "../../devices";

export const HARDWARE_NODE_KINDS = ["node", "camera"] as const;
export type HardwareNodeKind = (typeof HARDWARE_NODE_KINDS)[number];

/** devices.device_id VARCHAR(64); số node tối đa của một lần đăng ký. */
export const MAX_UID_LENGTH = 64;
export const MAX_HARDWARE_NODES = 16;

/** Phòng mặc định theo loại node — room_type theo danh sách ở 001_schema.sql (bảng rooms). */
export const DEFAULT_ROOM: Readonly<Record<HardwareNodeKind, { name: string; type: string }>> = {
  node: { name: "Phòng khách", type: "living_room" },
  camera: { name: "Camera", type: "camera" },
};

export const NODE_APPLIANCES: ReadonlyArray<{ appliance: Appliance; label: string; simulated: boolean }> = [
  { appliance: "lamp", label: "Đèn", simulated: false },
  { appliance: "fan", label: "Quạt", simulated: false },
  { appliance: "curtain", label: "Rèm cửa", simulated: false },
  { appliance: "ac", label: "Điều hòa", simulated: false },
];

export const GATEWAY_DEFAULT_NAME = "Gateway trung tâm";

/** "<node>-<hậu tố>", cắt bớt id node nếu cần để vừa MAX_UID_LENGTH. */
export function applianceUid(nodeUid: string, appliance: Appliance): string {
  return `${nodeUid.slice(0, MAX_UID_LENGTH - appliance.length - 1)}-${appliance}`;
}

/** "Phòng khách" → "phòng khách" để ghép sau tên thiết bị ("Đèn phòng khách"). */
function lowerFirst(text: string): string {
  return text.charAt(0).toLocaleLowerCase("vi-VN") + text.slice(1);
}

export function sensorName(roomName: string): string {
  return `Cảm biến nhiệt/ẩm ${lowerFirst(roomName)}`;
}

export function applianceName(label: string, roomName: string): string {
  return `${label} ${lowerFirst(roomName)}`;
}

/** Camera đầu tiên tên "Camera", các camera sau "Camera 2", "Camera 3"… (khách đổi tên được). */
export function cameraName(index: number): string {
  return index === 0 ? "Camera" : `Camera ${index + 1}`;
}
