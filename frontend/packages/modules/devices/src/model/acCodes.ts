import { portalErrorMessage } from "@shh/api-client/portal";
import { AC_SETPOINT_MAX, AC_SETPOINT_MIN } from "./appliance";

// Mã IR điều hòa mà Node đã học từ remote: 1 mã TẮT + 1 mã cho mỗi mức 16..30°C (16 ô, giống màn TFT của Node).
export type AcSlot = "off" | number;

export const AC_SLOTS: AcSlot[] = [
  "off",
  ...Array.from({ length: AC_SETPOINT_MAX - AC_SETPOINT_MIN + 1 }, (_, i) => AC_SETPOINT_MIN + i),
];

/** Thời gian Node chờ người dùng bấm remote khi học mã (giây). */
export const LEARN_WINDOW_SECONDS = 10;

export const slotLabel = (slot: AcSlot): string => (slot === "off" ? "TẮT" : `${slot}°C`);

/** Bit của slot trong bitmask `ac_codes`: bit 0 = TẮT, bit (t − 15) = t°C. */
const slotBit = (slot: AcSlot): number => (slot === "off" ? 0 : slot - AC_SETPOINT_MIN + 1);

/** true/false theo bitmask Node báo; null = Node chưa báo (chưa biết). */
export function isSlotLearned(codes: number | null | undefined, slot: AcSlot): boolean | null {
  if (typeof codes !== "number") return null;
  return ((codes >> slotBit(slot)) & 1) === 1;
}

export function learnedCount(codes: number | null | undefined): number | null {
  if (typeof codes !== "number") return null;
  return AC_SLOTS.filter((slot) => isSlotLearned(codes, slot)).length;
}

/** Hướng dẫn thao tác với remote trong lúc Node đang chờ tín hiệu. */
export function learnInstruction(slot: AcSlot): string {
  const aim = "Chĩa remote vào mắt thu trên Node (cách 5–20 cm)";
  return slot === "off"
    ? `${aim}, rồi bấm nút nguồn khi điều hòa đang bật.`
    : `${aim}, chỉnh remote về chế độ Lạnh + đúng ${slot}°C rồi bấm 1 lần.`;
}

const LEARN_OVERRIDES: Record<string, string> = {
  COMMAND_FAILED:
    "Node không thu được tín hiệu từ remote. Hãy chĩa remote gần mắt thu hơn (5–20 cm), kiểm tra mắt thu không bị che và pin remote còn tốt, bấm đúng 1 lần rồi thử lại. Nếu Node đang bận hoặc tín hiệu bị nhiễu, đợi vài giây rồi học lại.",
  TIMEOUT: "Node không trả lời kịp. Kiểm tra Node còn online (nguồn điện, WiFi) rồi thử học lại.",
  NOT_CONTROLLABLE: "Thiết bị này không hỗ trợ học mã điều hòa.",
};

export const learnErrorMessage = (err: unknown): string => portalErrorMessage(err, LEARN_OVERRIDES);
