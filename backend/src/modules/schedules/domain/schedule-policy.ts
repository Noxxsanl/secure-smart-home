// Chính sách hẹn giờ: thao tác nào hợp với loại thiết bị nào, chuyển giữa dạng khách chọn (action + temperature/position)
// và chuỗi lệnh lưu DB (DeviceCommandAction), nhãn tiếng Việt, kiểm "đã ở trạng thái đích". Hàm thuần — không DB.
import { toBool } from "../../../infrastructure/database/db";
import {
  parseSetPosAction,
  parseSetTempAction,
  toSetPosAction,
  toSetTempAction,
} from "../../devices";
import type { Appliance, DeviceCommandAction, DeviceRow } from "../../devices";
import type { Schedule, ScheduleAction, ScheduleInput, ScheduleRow } from "./schedule.types";

/** Số lịch `scheduled` tối đa mỗi nhà (vượt → 409 SCHEDULE_LIMIT). */
export const MAX_SCHEDULED_PER_HOME = 50;

/** Chỉ 4 loại đồ gia dụng của Node mới hẹn giờ được. */
export const SCHEDULABLE_APPLIANCES: readonly Appliance[] = ["lamp", "fan", "curtain", "ac"];

const ACTIONS_BY_APPLIANCE: Readonly<Record<Appliance, readonly ScheduleAction[]>> = {
  lamp: ["turn_on", "turn_off"],
  fan: ["turn_on", "turn_off"],
  curtain: ["turn_on", "turn_off", "set_pos"],
  ac: ["turn_on", "turn_off", "set_temp"],
};

/** Thiết bị có hẹn giờ được không: relay + appliance thuộc 4 loại. */
export function isSchedulableDevice(device: Pick<DeviceRow, "category" | "appliance">): boolean {
  return device.category === "relay" && device.appliance !== null && SCHEDULABLE_APPLIANCES.includes(device.appliance);
}

/** Thao tác có hợp loại thiết bị không (đèn/quạt: bật/tắt · rèm: + set_pos · điều hoà: + set_temp). */
export function isActionAllowed(appliance: Appliance, action: ScheduleAction): boolean {
  return ACTIONS_BY_APPLIANCE[appliance].includes(action);
}

/** (action, temperature, position) đã kiểm → chuỗi lệnh lưu DB, đúng chuỗi sendDeviceCommand nhận. */
export function toCommandAction(input: Pick<ScheduleInput, "action" | "temperature" | "position">): DeviceCommandAction {
  if (input.action === "set_temp" && input.temperature !== null) return toSetTempAction(input.temperature);
  if (input.action === "set_pos" && input.position !== null) return toSetPosAction(input.position);
  return input.action === "turn_off" ? "turn_off" : "turn_on";
}

export interface SplitAction {
  action: ScheduleAction;
  temperature: number | null;
  position: number | null;
}

/** Chuỗi lệnh đã lưu → dạng tách của DTO. Chuỗi lạ (không thể xảy ra nếu chỉ ghi qua toCommandAction) coi như turn_on. */
export function splitAction(command: string): SplitAction {
  const temperature = parseSetTempAction(command);
  if (temperature !== null) return { action: "set_temp", temperature, position: null };
  const position = parseSetPosAction(command);
  if (position !== null) return { action: "set_pos", temperature: null, position };
  return { action: command === "turn_off" ? "turn_off" : "turn_on", temperature: null, position: null };
}

const DELETED_DEVICE_NAME = "thiết bị đã xoá";

/** Nhãn ngắn của thao tác (KHÔNG chứa tên phòng): "Bật Đèn", "Mở Rèm 50%", "Đặt Điều hoà 26°C"… */
export function actionLabel(command: string, appliance: Appliance | null, deviceName: string | null): string {
  const name = deviceName ?? DELETED_DEVICE_NAME;
  const split = splitAction(command);
  const isCurtain = appliance === "curtain";
  if (split.action === "set_temp") return `Đặt ${name} ${split.temperature}°C`;
  if (split.action === "set_pos") return split.position === 0 ? `Đóng ${name}` : `Mở ${name} ${split.position}%`;
  if (split.action === "turn_off") return isCurtain ? `Đóng ${name}` : `Tắt ${name}`;
  return isCurtain ? `Mở ${name}` : `Bật ${name}`;
}

/** Chữ đầu viết thường — để ghép vào câu ("Đã " + "tắt Quạt"). */
export function lowerFirst(text: string): string {
  return text.length === 0 ? text : text.charAt(0).toLocaleLowerCase("vi-VN") + text.slice(1);
}

/**
 * Thiết bị đã ở trạng thái đích chưa (→ bỏ qua, không gửi lệnh thừa):
 *   turn_on  power = true và (không phải rèm hoặc curtain_pos = 100) · turn_off  power = false
 *   set_temp_N  power = true và ac_setpoint = N · set_pos_N  curtain_pos = N
 */
export function isAlreadyInState(command: string, device: Pick<DeviceRow, "power_state" | "appliance" | "curtain_pos" | "ac_setpoint">): boolean {
  const power = device.power_state === null ? null : toBool(device.power_state);
  const split = splitAction(command);
  switch (split.action) {
    case "turn_on":
      return power === true && (device.appliance !== "curtain" || device.curtain_pos === 100);
    case "turn_off":
      return power === false;
    case "set_temp":
      return power === true && device.ac_setpoint === split.temperature;
    case "set_pos":
      return device.curtain_pos === split.position;
  }
}

/** Lý do thất bại (error_code của lịch) → cụm tiếng Việt trong thông báo SCHEDULE_FAILED. */
export const FAILURE_REASON_TEXT: Readonly<Record<string, string>> = {
  DEVICE_OFFLINE: "thiết bị đang ngoại tuyến",
  TIMEOUT: "thiết bị không phản hồi",
  COMMAND_FAILED: "thiết bị báo lỗi",
  DEVICE_BLOCKED: "thiết bị đang bị chặn",
  HOME_SUSPENDED: "nhà đang tạm ngưng",
  NO_DEVICE: "thiết bị đã bị xoá",
  NOT_CONTROLLABLE: "thiết bị không hỗ trợ thao tác này",
};

export function failureReasonText(code: string): string {
  return FAILURE_REASON_TEXT[code] ?? "lỗi không xác định";
}

/** 11 mã `error_code` của hợp đồng (DTO Schedule) — frontend chỉ map đúng các mã này sang lý do tiếng Việt. */
export const SCHEDULE_ERROR_CODES: readonly string[] = [
  "DEVICE_OFFLINE",
  "TIMEOUT",
  "COMMAND_FAILED",
  "DEVICE_BLOCKED",
  "HOME_SUSPENDED",
  "NOT_CONTROLLABLE",
  "NO_DEVICE",
  "ACCESS_REVOKED",
  "ALREADY_IN_STATE",
  "INTERRUPTED",
  "UNKNOWN",
];

/**
 * Mã lỗi của HttpError do lệnh ném → `error_code` của lịch: chỉ nhận 11 mã của hợp đồng. `NOT_FOUND` (thiết bị không còn)
 * → NO_DEVICE; mọi mã khác (INVALID_INPUT, …) → UNKNOWN để không rò mã nội bộ ra DTO.
 */
export function normalizeErrorCode(code: string): string {
  if (code === "NOT_FOUND") return "NO_DEVICE";
  return SCHEDULE_ERROR_CODES.includes(code) ? code : "UNKNOWN";
}

/** ScheduleRow → Schedule DTO. `callerUserId`/`callerIsOwner` quyết định `can_cancel`. */
export function toScheduleDto(row: ScheduleRow, callerUserId: number, callerIsOwner: boolean): Schedule {
  const split = splitAction(row.action);
  return {
    id: row.id,
    home_id: row.home_id,
    timezone: row.timezone,
    device_id: row.device_id,
    device_name: row.device_name,
    room_name: row.room_name,
    appliance: row.appliance,
    action: split.action,
    temperature: split.temperature,
    position: split.position,
    action_label: actionLabel(row.action, row.appliance, row.device_name),
    run_at: row.run_at.toISOString(),
    status: row.status,
    origin: row.origin,
    channel: row.channel,
    created_by_user_id: row.created_by_user_id,
    created_by_name: row.created_by_name,
    error_code: row.error_code,
    executed_at: row.executed_at ? row.executed_at.toISOString() : null,
    cancelled_at: row.cancelled_at ? row.cancelled_at.toISOString() : null,
    created_at: row.created_at.toISOString(),
    can_cancel: row.status === "scheduled" && (row.created_by_user_id === callerUserId || callerIsOwner),
  };
}
