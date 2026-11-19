// Logic THUẦN của nhật ký hành vi (không đụng DB): suy ra hành động từ trạng thái trước/sau và ánh xạ nguồn.
// Dùng chung cho đường 1 (lệnh từ server, send-device-command) và đường 2 (telemetry của Node, record-behavior).
import type { BehaviorAction, BehaviorAppliance, BehaviorSource, LoadState } from "./behavior.types";
import type { CommandChannel, CommandSource } from "./command.types";

/**
 * Hành động tạo ra khi tải chuyển từ `before` sang `after`; null = không có gì đổi → KHÔNG ghi dòng nào
 * (vd bấm "bật" khi đã bật, hoặc lệnh đặt đúng nhiệt độ đang đặt).
 *   - power false/null → true        : TURN_ON   (kể cả điều hoà vừa bật kèm nhiệt độ mới; nhiệt độ nằm ở level_after)
 *   - power true/null  → false       : TURN_OFF
 *   - power không đổi, level đổi     : rèm → SET_POS, điều hoà → SET_TEMP (loại khác không có level)
 */
export function deriveBehaviorAction(appliance: BehaviorAppliance, before: LoadState, after: LoadState): BehaviorAction | null {
  if (after.power === true && before.power !== true) return "TURN_ON";
  if (after.power === false && before.power !== false) return "TURN_OFF";
  if (after.level !== null && after.level !== before.level) {
    if (appliance === "curtain") return "SET_POS";
    if (appliance === "ac") return "SET_TEMP";
  }
  return null;
}

/**
 * Nguồn ghi vào user_behavior_logs từ nguồn + kênh của lệnh: automation → automation, schedule → schedule,
 * ai_agent → ai_agent, operator hoặc kênh dashboard → dashboard, kênh mobile → mobile, còn lại (portal web) → manual.
 */
export function behaviorSourceOf(source: CommandSource, channel: CommandChannel): BehaviorSource {
  if (source === "automation") return "automation";
  if (source === "schedule") return "schedule";
  if (source === "ai_agent") return "ai_agent";
  if (source === "operator" || channel === "dashboard") return "dashboard";
  return channel === "mobile" ? "mobile" : "manual";
}

/** previous_state / new_state: "ON" | "OFF" theo power (cả điều hoà — nhiệt độ nằm ở level_*), null = chưa biết. */
export function powerLabel(power: boolean | null): "ON" | "OFF" | null {
  return power === null ? null : power ? "ON" : "OFF";
}

/**
 * Lệnh gần thời điểm đổi trạng thái có "giải thích" được thay đổi đó không? turn_on ↔ hành động BẬT, turn_off ↔ TẮT
 * (không khớp khi chỉ đổi level — vd lệnh turn_on chưa ack không được nhận phần bấm đổi nhiệt độ tại chỗ),
 * set_temp_N / set_pos_N ↔ level sau = N. learn_* và chuỗi lạ không bao giờ khớp.
 */
export function commandExplainsChange(command: string, action: BehaviorAction, after: LoadState): boolean {
  if (command === "turn_on") return action === "TURN_ON";
  if (command === "turn_off") return action === "TURN_OFF";
  const match = /^set_(?:temp|pos)_(\d+)$/.exec(command);
  return match !== null && after.level === Number(match[1]);
}
