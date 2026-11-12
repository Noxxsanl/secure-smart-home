// Điều hoà điều khiển qua IR (Node phòng khách học mã IR rồi phát lại): lệnh đặt nhiệt độ + đọc báo cáo từ telemetry.
// Một nơi duy nhất định nghĩa miền 16..30 và dạng chuỗi `set_temp_<NN>` để REST, ack, simulator và ingest không lệch nhau.
import type { LearnAction, SetTempAction } from "./device.types";

export const AC_SETPOINT_MIN = 16;
export const AC_SETPOINT_MAX = 30;

const SET_TEMP_RE = /^set_temp_(\d{2})$/;
const LEARN_RE = /^learn_t(\d{2})$/;

/** Miền của devices.ac_codes (CHECK 0..65535): bit 0 = TẮT, bit 1..15 = BẬT ở 16..30°C. */
export const AC_CODES_MAX = 65535;

export function isValidAcSetpoint(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= AC_SETPOINT_MIN && value <= AC_SETPOINT_MAX;
}

/** 24 → "set_temp_24". Người gọi phải đã kiểm isValidAcSetpoint. */
export function toSetTempAction(temperature: number): SetTempAction {
  if (!isValidAcSetpoint(temperature)) throw new RangeError("AC setpoint out of range");
  return `set_temp_${temperature}`;
}

/** "set_temp_24" → 24; mọi chuỗi khác (turn_on, set_temp_99, set_temp_5…) → null. */
export function parseSetTempAction(action: string): number | null {
  const match = SET_TEMP_RE.exec(action);
  if (!match) return null;
  const value = Number(match[1]);
  return isValidAcSetpoint(value) ? value : null;
}

/** Ô học mã: "off" (mã TẮT) hoặc nhiệt độ 16..30 (mã BẬT-làm-lạnh ở nhiệt độ đó). */
export type LearnSlot = "off" | number;

/** "off" → "learn_off", 24 → "learn_t24". Người gọi phải đã kiểm slot hợp lệ. */
export function toLearnAction(slot: LearnSlot): LearnAction {
  if (slot === "off") return "learn_off";
  if (!isValidAcSetpoint(slot)) throw new RangeError("AC learn slot out of range");
  return `learn_t${slot}`;
}

/** "learn_off" → "off", "learn_t24" → 24; mọi chuỗi khác → null. */
export function parseLearnAction(action: string): LearnSlot | null {
  if (action === "learn_off") return "off";
  const match = LEARN_RE.exec(action);
  if (!match) return null;
  const value = Number(match[1]);
  return isValidAcSetpoint(value) ? value : null;
}

/** Bit của một ô trong ac_codes: TẮT → bit 0, t°C → bit (t − 15). */
export function learnSlotMask(slot: LearnSlot): number {
  return slot === "off" ? 1 : 1 << (slot - (AC_SETPOINT_MIN - 1));
}

/** ac_codes Node báo trong telemetry: số nguyên 0..65535, sai kiểu/miền → null (bỏ qua). */
export function isValidAcCodes(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= AC_CODES_MAX;
}
