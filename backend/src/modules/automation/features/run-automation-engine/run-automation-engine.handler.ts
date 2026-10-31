// Automation engine (CONTRACT_V2 §6, FR-7.1, NFR-R3) — phần đánh giá + thực thi; job.ts nối vào bus và timer.
//
//   sensor_threshold  nghe bus `telemetry`; đánh giá theo CẠNH (false→true) qua last_condition_state,
//                     cooldown 60 s. Việc "giành quyền chạy" là một UPDATE có điều kiện nên hai số đo đến
//                     đồng thời (2 cảm biến cùng phòng) chỉ kích hoạt rule đúng một lần.
//   schedule          mỗi 30 s so khớp HH:MM + thứ theo MÚI GIỜ CỦA NHÀ; UPDATE có điều kiện trên
//                     last_triggered_at bảo đảm tối đa một lần mỗi phút (tick 30 s nên mỗi phút có 2 tick).
//
// Thực thi duy nhất qua sendDeviceCommand(source 'automation', channel 'system') — nó tự ghi device_commands,
// user_behavior_logs (nguồn 'automation', hoặc 'ai_suggested' khi rule sinh từ gợi ý đã chấp nhận) và audit
// DEVICE_COMMAND. Invariant 8: engine chỉ chạy RULE; gợi ý chưa được chấp nhận không có đường nào tới đây.
// Nhà suspended/unclaimed bị bỏ qua. Mọi lỗi được bắt tại chỗ — engine không bao giờ làm sập tiến trình.
import { toNumberOrNull } from "../../../../infrastructure/database/db";
import type { TelemetryEvent } from "../../../../shared/events/event-bus";
import { HttpError } from "../../../../shared/errors/http-error";
import { homeLocalParts } from "../../../../shared/time";
import { logEvent } from "../../../audit";
import { sendDeviceCommand } from "../../../control";
import { getDeviceRow } from "../../../devices";
import { notifyHomeMembers } from "../../../notifications";
import { FAILURE_TEXT, conditionHolds, failureCode, parseScheduleDays } from "../../domain/engine-policy";
import {
  listScheduleRules,
  listSensorRulesOfRoom,
  type EngineRuleRow,
} from "../../infrastructure/automation-engine.read-model";
import {
  claimScheduleRuleTrigger,
  claimSensorRuleTrigger,
  insertHistory,
  resetConditionState,
} from "../../infrastructure/automation-rule.repository";

// ── Thực thi ───────────────────────────────────────────────────────────────

async function writeHistory(rule: EngineRuleRow, result: "success" | "failed" | "skipped", details: Record<string, unknown>): Promise<void> {
  try {
    await insertHistory(rule.id, rule.home_id, result, details);
  } catch (err) {
    console.error("[automation] failed to write history:", err instanceof Error ? err.message : "unknown error");
  }
}

async function executeRule(rule: EngineRuleRow, trigger: Record<string, unknown>): Promise<void> {
  const verb = rule.action_command === "turn_on" ? "Bật" : "Tắt";
  const deviceName = rule.action_device_name ?? "thiết bị";
  try {
    if (rule.action_device_id === null || rule.action_device_name === null) {
      throw new HttpError(404, "NO_DEVICE", "Rule action device no longer exists");
    }

    // Thiết bị đã ở đúng trạng thái → ghi 'skipped', không phát lệnh/thông báo thừa (vd "tắt đèn bếp 23:30"
    // khi đèn đã tắt từ trước)
    const device = await getDeviceRow(rule.action_device_id);
    const targetPower = rule.action_command === "turn_on";
    if (device && device.power_state === targetPower) {
      await writeHistory(rule, "skipped", { trigger, reason: "ALREADY_IN_STATE", action: rule.action_command });
      return;
    }

    const result = await sendDeviceCommand({
      deviceId: rule.action_device_id,
      action: rule.action_command,
      issuedBy: null,
      source: "automation",
      channel: "system",
      behaviorSource: rule.origin === "ai_suggested" ? "ai_suggested" : undefined,
    });
    await writeHistory(rule, "success", {
      trigger,
      action: rule.action_command,
      device_id: rule.action_device_id,
      command_id: result.command.id,
    });
    await logEvent({
      eventType: "AUTOMATION_TRIGGERED",
      homeId: rule.home_id,
      deviceId: rule.action_device_id,
      message: `Quy tắc "${rule.name}" đã chạy: ${verb} ${deviceName}`,
      details: { rule_id: rule.id, trigger, action: rule.action_command, origin: rule.origin },
    });
    await notifyHomeMembers({
      homeId: rule.home_id,
      roles: ["OWNER", "CONTROLLER"],
      type: "AUTOMATION_TRIGGERED",
      title: "Tự động hoá đã chạy",
      message: `Quy tắc “${rule.name}” đã chạy: ${verb} ${deviceName}.`,
      severity: "success",
      relatedDeviceId: rule.action_device_id,
    });
  } catch (err) {
    const code = failureCode(err);
    await writeHistory(rule, "failed", { trigger, reason: code, action: rule.action_command });
    await logEvent({
      eventType: "AUTOMATION_FAILED",
      homeId: rule.home_id,
      deviceId: rule.action_device_id,
      message: `Quy tắc "${rule.name}" không chạy được (${code})`,
      details: { rule_id: rule.id, trigger, reason: code },
    });
    await notifyHomeMembers({
      homeId: rule.home_id,
      roles: ["OWNER", "CONTROLLER"],
      type: "AUTOMATION_FAILED",
      title: "Tự động hoá không chạy được",
      message: `Quy tắc “${rule.name}” không chạy được: ${FAILURE_TEXT[code] ?? "lỗi không xác định"}.`,
      severity: "warning",
      relatedDeviceId: rule.action_device_id,
    });
  }
}

// ── sensor_threshold ───────────────────────────────────────────────────────

async function evaluateSensorRule(rule: EngineRuleRow, event: TelemetryEvent): Promise<void> {
  if (rule.condition_sensor_type === null || rule.condition_operator === null) return;
  const threshold = toNumberOrNull(rule.condition_threshold_value);
  if (threshold === null) return;
  const value = rule.condition_sensor_type === "TEMPERATURE" ? event.reading.temperature : event.reading.humidity;
  if (value === null) return; // số đo này không có chỉ số cần xét (vd cảm biến cửa) → không đổi trạng thái

  if (!conditionHolds(value, rule.condition_operator, threshold)) {
    // Điều kiện hết đúng → "nạp lại" cạnh để lần đúng tiếp theo kích hoạt được
    if (rule.last_condition_state !== false) {
      await resetConditionState(rule.id);
    }
    return;
  }

  // Giành quyền chạy: chỉ khi trước đó chưa đúng (cạnh lên) VÀ đã qua cooldown. Nếu đang cooldown thì
  // KHÔNG đặt state=1, để số đo kế tiếp (vẫn đúng) thử lại sau khi hết cooldown.
  const claimed = await claimSensorRuleTrigger(rule.id);
  if (!claimed) return;

  await executeRule(rule, {
    type: "sensor_threshold",
    metric: rule.condition_sensor_type.toLowerCase(),
    operator: rule.condition_operator,
    threshold,
    value,
    device_id: event.device_id,
  });
}

/** Listener của bus `telemetry`: đánh giá rule ngưỡng của đúng phòng phát số đo. */
export async function handleTelemetry(event: TelemetryEvent): Promise<void> {
  if (event.room_id === null) return;
  try {
    const rules = await listSensorRulesOfRoom(event.home_id, event.room_id);
    for (const rule of rules) {
      try {
        await evaluateSensorRule(rule, event);
      } catch (err) {
        console.error("[automation] sensor rule failed:", err instanceof Error ? err.message : "unknown error");
      }
    }
  } catch (err) {
    console.error("[automation] telemetry handling failed:", err instanceof Error ? err.message : "unknown error");
  }
}

// ── schedule ───────────────────────────────────────────────────────────────

let scheduleRunning = false;

/** Một tick lịch (30 s/lần): so khớp HH:MM + thứ theo múi giờ nhà rồi giành quyền chạy tối đa 1 lần/phút. */
export async function runScheduleTick(): Promise<void> {
  if (scheduleRunning) return;
  scheduleRunning = true;
  try {
    const now = new Date();
    const minuteStart = new Date(Math.floor(now.getTime() / 60_000) * 60_000);
    const rules = await listScheduleRules();
    for (const rule of rules) {
      try {
        if (!rule.schedule_time_of_day) continue;
        const local = homeLocalParts(now, rule.timezone);
        if (local.hhmm !== rule.schedule_time_of_day) continue;
        if (!parseScheduleDays(rule.schedule_days_of_week).includes(local.isoWeekday)) continue;

        // Tối đa 1 lần/phút: chỉ tick nào cập nhật được dòng (last_triggered_at còn trước đầu phút) mới chạy
        const claimed = await claimScheduleRuleTrigger(rule.id, minuteStart);
        if (!claimed) continue;

        await executeRule(rule, { type: "schedule", time: rule.schedule_time_of_day, iso_weekday: local.isoWeekday });
      } catch (err) {
        console.error("[automation] schedule rule failed:", err instanceof Error ? err.message : "unknown error");
      }
    }
  } catch (err) {
    console.error("[automation] schedule tick failed:", err instanceof Error ? err.message : "unknown error");
  } finally {
    scheduleRunning = false;
  }
}
