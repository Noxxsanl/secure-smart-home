import type { LucideIcon } from "lucide-react";
import { Camera, DoorClosed, Server, Thermometer, ToggleLeft } from "lucide-react";
import type { DeviceCategory } from "@shh/api-client/dashboard";

// Icon theo loại thiết bị — dùng ở danh sách Devices, tab Devices của Smart Home.
export const CATEGORY_ICONS: Record<DeviceCategory, LucideIcon> = {
  gateway: Server,
  sensor: Thermometer,
  relay: ToggleLeft,
  camera: Camera,
  door_contact: DoorClosed,
};
