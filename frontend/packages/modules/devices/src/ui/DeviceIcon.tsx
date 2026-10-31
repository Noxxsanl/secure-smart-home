import {
  Camera, Cpu, DoorClosed, DoorOpen, Fan, Lightbulb, Power, Router, Snowflake, Thermometer,
} from "lucide-react";
import type { CustomerDevice } from "@shh/api-client/portal";

type DeviceIconProps = {
  device: Pick<CustomerDevice, "category" | "device_name" | "latest">;
  className?: string;
};

// Relay chỉ biết là "công tắc" — đoán đồ vật theo tên do kit đặt sẵn
// ("Đèn phòng khách", "Quạt phòng ngủ") để icon dễ nhận ra hơn. Mỗi nhánh trả về
// JSX tĩnh (không tạo component trong lúc render — React Compiler yêu cầu vậy).
export default function DeviceIcon({ device, className }: DeviceIconProps) {
  switch (device.category) {
    case "relay": {
      const name = device.device_name;
      if (/đèn|light|lamp/i.test(name)) return <Lightbulb className={className} />;
      if (/quạt|fan/i.test(name)) return <Fan className={className} />;
      if (/điều hoà|điều hòa|máy lạnh|air/i.test(name)) return <Snowflake className={className} />;
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
