import {
  Blinds, Camera, Cpu, DoorClosed, Lightbulb, Lock, Snowflake, Sparkles, Speaker, Sprout, Thermometer,
  type LucideIcon,
} from "lucide-react";
import type { MockDevice } from "@smarthome/shared/mock/types";

type DeviceIconKey =
  | "light" | "air" | "curtain" | "irrigation" | "speaker" | "vacuum" | "lock"
  | "sensor" | "camera" | "door" | "other";

export const DEVICE_ICONS: Record<DeviceIconKey, LucideIcon> = {
  light: Lightbulb, air: Snowflake, curtain: Blinds, irrigation: Sprout, speaker: Speaker,
  vacuum: Sparkles, lock: Lock, sensor: Thermometer, camera: Camera, door: DoorClosed, other: Cpu,
};

const NAME_PATTERNS: [RegExp, DeviceIconKey][] = [
  [/light|đèn/i, "light"],
  [/air|điều hoà/i, "air"],
  [/curtain|rèm/i, "curtain"],
  [/irrigation|tưới/i, "irrigation"],
  [/speaker|loa/i, "speaker"],
  [/vacuum|hút bụi/i, "vacuum"],
  [/lock|khoá/i, "lock"],
];

export function deviceIconKey(device: Pick<MockDevice, "device_name" | "category">): DeviceIconKey {
  const byName = NAME_PATTERNS.find(([re]) => re.test(device.device_name));
  if (byName) return byName[1];
  if (device.category === "sensor") return "sensor";
  if (device.category === "camera") return "camera";
  if (device.category === "door_contact") return "door";
  return "other";
}
