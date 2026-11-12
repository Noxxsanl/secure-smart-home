import {
  Blinds, Camera, Cpu, DoorClosed, DoorOpen, Fan, Lightbulb, Power, Router, Snowflake, Thermometer,
} from "lucide-react";
import type { CustomerDevice } from "@shh/api-client/portal";
import { applianceKind } from "../model/appliance";

type DeviceIconProps = {
  device: Pick<CustomerDevice, "category" | "device_name" | "latest" | "appliance">;
  className?: string;
};

// Relay: icon theo đồ vật đoán từ tên (model/appliance). Mỗi nhánh trả về JSX tĩnh
// (không tạo component trong lúc render — React Compiler yêu cầu vậy).
export default function DeviceIcon({ device, className }: DeviceIconProps) {
  switch (device.category) {
    case "relay":
      switch (applianceKind(device)) {
        case "lamp":
          return <Lightbulb className={className} />;
        case "fan":
          return <Fan className={className} />;
        case "curtain":
          return <Blinds className={className} />;
        case "ac":
          return <Snowflake className={className} />;
        default:
          return <Power className={className} />;
      }
    case "sensor":
      return <Thermometer className={className} />;
    case "door_contact":
      return device.latest?.door_open ? <DoorOpen className={className} /> : <DoorClosed className={className} />;
    case "camera":
      return <Camera className={className} />;
    case "gateway":
      return <Router className={className} />;
    default:
      return <Cpu className={className} />;
  }
}

export const CATEGORY_LABELS: Record<CustomerDevice["category"], string> = {
  gateway: "Gateway",
  sensor: "Cảm biến nhiệt/ẩm",
  relay: "Công tắc (relay)",
  camera: "Camera",
  door_contact: "Cảm biến cửa",
};
