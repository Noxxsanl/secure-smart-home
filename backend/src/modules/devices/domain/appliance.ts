// Điều hoà điều khiển qua IR (Node phòng khách học mã IR rồi phát lại): lệnh đặt nhiệt độ + đọc báo cáo từ telemetry.
// Một nơi duy nhất định nghĩa miền 16..30 và dạng chuỗi `set_temp_<NN>` để REST, ack, simulator và ingest không lệch nhau.
import type { LearnAction, SetPosAction, SetTempAction } from "./device.types";

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

// ── Rèm (động cơ bước): mở tới N % ─────────────────────────────────────────────
// Node nhận `set_pos_<0..100>` (0 = đóng) bên cạnh turn_on (mở 100 %) / turn_off (đóng); báo lại telemetry `curtain`.
export const CURTAIN_POS_MIN = 0;
export const CURTAIN_POS_MAX = 100;

// Không cho số 0 đứng đầu (`set_pos_050`) — đúng một chuỗi cho mỗi vị trí, khớp chuỗi lưu ở device_commands.command
const SET_POS_RE = /^set_pos_(0|[1-9]\d{0,2})$/;

export function isValidCurtainPos(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= CURTAIN_POS_MIN && value <= CURTAIN_POS_MAX;
}

/** 50 → "set_pos_50". Người gọi phải đã kiểm isValidCurtainPos. */
export function toSetPosAction(position: number): SetPosAction {
  if (!isValidCurtainPos(position)) throw new RangeError("Curtain position out of range");
  return `set_pos_${position}`;
}

/** "set_pos_50" → 50; mọi chuỗi khác (turn_on, set_pos_101, set_pos_050…) → null. */
export function parseSetPosAction(action: string): number | null {
  const match = SET_POS_RE.exec(action);
  if (!match) return null;
  const value = Number(match[1]);
  return isValidCurtainPos(value) ? value : null;
}

/**
 * Vị trí rèm Node báo trong telemetry `curtain`: 0 → 0; 2..100 (số nguyên hoặc thập phân, làm tròn) → giá trị đó;
 * 1 = "mở nhưng chưa rõ %" → null (giữ curtain_pos cũ); boolean/sai kiểu/ngoài miền → null.
 */
export function parseReportedCurtainPos(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  if (value === 0) return 0;
  const rounded = Math.round(value);
  return rounded >= 2 && rounded <= CURTAIN_POS_MAX ? rounded : null;
}

/** ac_codes Node báo trong telemetry: số nguyên 0..65535, sai kiểu/miền → null (bỏ qua). */
export function isValidAcCodes(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= AC_CODES_MAX;
}
