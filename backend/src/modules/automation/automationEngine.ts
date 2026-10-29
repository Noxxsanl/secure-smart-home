// Automation engine (CONTRACT_V2 §6, FR-7.1, NFR-R3).
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
import { queryRows, runSql, toNumberOrNull } from "../../lib/db";
import { eventBus, type TelemetryEvent } from "../../lib/eventBus";
import { HttpError } from "../../lib/http";
import { homeLocalParts } from "../../lib/time";
import { getDeviceRow } from "../devices/deviceReadModel";
import { sendDeviceCommand } from "../devices/deviceCommand.service";
import { logEvent } from "../logs/logEvent";
import { notifyHomeMembers } from "../notifications/notification.service";

const SCHEDULE_TICK_MS = 30_000;
const COOLDOWN_SECONDS = 60;
const EQUALITY_EPSILON = 0.05; // so sánh '=' trên số thực: số đo lẻ 1 chữ số thập phân

interface RuleRow {
  id: number;
  home_id: number;
  name: string;
  trigger_type: "sensor_threshold" | "schedule";
  condition_sensor_type: "TEMPERATURE" | "HUMIDITY" | null;
  condition_operator: ">" | "<" | "=" | null;
  condition_threshold_value: string | number | null;
  schedule_time_of_day: string | null;
  schedule_days_of_week: string | null;
  action_device_id: number | null;
  action_command: "turn_on" | "turn_off";
  origin: "user" | "ai_suggested";
  last_condition_state: boolean | null;
  last_triggered_at: Date | null;
  timezone: string;
  action_device_name: string | null;
}

// Chỉ nhà 'active' mới chạy rule (suspended: khoá điều khiển; unclaimed: chưa có chủ)
const RULE_SELECT_SQL = `
  SELECT r.id, r.home_id, r.name, r.trigger_type, r.condition_sensor_type, r.condition_operator,
         r.condition_threshold_value, r.schedule_time_of_day, r.schedule_days_of_week,
         r.action_device_id, r.action_command, r.origin, r.last_condition_state, r.last_triggered_at,
         h.timezone, d.device_name AS action_device_name
    FROM automation_rules r
    JOIN smart_homes h ON h.id = r.home_id
    LEFT JOIN devices d ON d.id = r.action_device_id AND d.home_id = r.home_id
   WHERE r.is_enabled = TRUE AND h.status = 'active' AND r.trigger_type = ?`;

// ── Thực thi ───────────────────────────────────────────────────────────────

const FAILURE_TEXT: Record<string, string> = {
  DEVICE_OFFLINE: "thiết bị đang ngoại tuyến",
  DEVICE_BLOCKED: "thiết bị đang bị chặn",
  HOME_SUSPENDED: "nhà đang tạm ngưng",
  TIMEOUT: "thiết bị không phản hồi",
  COMMAND_FAILED: "thiết bị báo lỗi",
  NOT_CONTROLLABLE: "thiết bị không điều khiển được",
  NOT_FOUND: "không tìm thấy thiết bị",
  NO_DEVICE: "thiết bị đích đã bị xoá",
};

function failureCode(err: unknown): string {
  return err instanceof HttpError ? err.code : "UNKNOWN";
}

async function writeHistory(rule: RuleRow, result: "success" | "failed" | "skipped", details: Record<string, unknown>): Promise<void> {
  try {
    await runSql(
      "INSERT INTO automation_history (rule_id, home_id, triggered_at, result, details) VALUES (?, ?, ?, ?, ?)",
      [rule.id, rule.home_id, new Date(), result, JSON.stringify(details)]
    );
  } catch (err) {
    console.error("[automation] failed to write history:", err instanceof Error ? err.message : "unknown error");
  }
}

async function executeRule(rule: RuleRow, trigger: Record<string, unknown>): Promise<void> {
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

function conditionHolds(value: number, operator: ">" | "<" | "=", threshold: number): boolean {
  if (operator === ">") return value > threshold;
  if (operator === "<") return value < threshold;
  return Math.abs(value - threshold) < EQUALITY_EPSILON;
}

async function evaluateSensorRule(rule: RuleRow, event: TelemetryEvent): Promise<void> {
  if (rule.condition_sensor_type === null || rule.condition_operator === null) return;
  const threshold = toNumberOrNull(rule.condition_threshold_value);
  if (threshold === null) return;
  const value = rule.condition_sensor_type === "TEMPERATURE" ? event.reading.temperature : event.reading.humidity;
  if (value === null) return; // số đo này không có chỉ số cần xét (vd cảm biến cửa) → không đổi trạng thái

  if (!conditionHolds(value, rule.condition_operator, threshold)) {
    // Điều kiện hết đúng → "nạp lại" cạnh để lần đúng tiếp theo kích hoạt được
    if (rule.last_condition_state !== false) {
      await runSql("UPDATE automation_rules SET last_condition_state = FALSE WHERE id = ?", [rule.id]);
    }
    return;
  }

  // Giành quyền chạy: chỉ khi trước đó chưa đúng (cạnh lên) VÀ đã qua cooldown. Nếu đang cooldown thì
  // KHÔNG đặt state=1, để số đo kế tiếp (vẫn đúng) thử lại sau khi hết cooldown.
  const claimed = await runSql(
    `UPDATE automation_rules SET last_condition_state = TRUE, last_triggered_at = NOW()
      WHERE id = ? AND is_enabled = TRUE
        AND (last_condition_state IS NULL OR last_condition_state = FALSE)
        AND (last_triggered_at IS NULL OR last_triggered_at <= NOW() - make_interval(secs => ${COOLDOWN_SECONDS}))`,
    [rule.id]
  );
  if (claimed.affectedRows === 0) return;

  await executeRule(rule, {
    type: "sensor_threshold",
    metric: rule.condition_sensor_type.toLowerCase(),
    operator: rule.condition_operator,
    threshold,
    value,
    device_id: event.device_id,
  });
}

async function handleTelemetry(event: TelemetryEvent): Promise<void> {
  if (event.room_id === null) return;
  try {
    const rules = await queryRows<RuleRow>(`${RULE_SELECT_SQL} AND r.home_id = ? AND r.condition_room_id = ?`, [
      "sensor_threshold",
      event.home_id,
      event.room_id,
    ]);
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

function parseDays(csv: string | null): number[] {
  if (!csv) return [];
  return csv
    .split(",")
    .map((part) => Number(part.trim()))
    .filter((day) => Number.isInteger(day) && day >= 1 && day <= 7);
}

let scheduleRunning = false;

async function runScheduleTick(): Promise<void> {
  if (scheduleRunning) return;
  scheduleRunning = true;
  try {
    const now = new Date();
    const minuteStart = new Date(Math.floor(now.getTime() / 60_000) * 60_000);
    const rules = await queryRows<RuleRow>(RULE_SELECT_SQL, ["schedule"]);
    for (const rule of rules) {
      try {
        if (!rule.schedule_time_of_day) continue;
        const local = homeLocalParts(now, rule.timezone);
        if (local.hhmm !== rule.schedule_time_of_day) continue;
        if (!parseDays(rule.schedule_days_of_week).includes(local.isoWeekday)) continue;

        // Tối đa 1 lần/phút: chỉ tick nào cập nhật được dòng (last_triggered_at còn trước đầu phút) mới chạy
        const claimed = await runSql(
          `UPDATE automation_rules SET last_triggered_at = NOW()
            WHERE id = ? AND is_enabled = TRUE AND (last_triggered_at IS NULL OR last_triggered_at < ?)`,
          [rule.id, minuteStart]
        );
        if (claimed.affectedRows === 0) continue;

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

let started = false;

export function startAutomationEngine(): void {
  if (started) return;
  started = true;
  eventBus.on("telemetry", (event) => handleTelemetry(event));
  const timer = setInterval(() => void runScheduleTick(), SCHEDULE_TICK_MS);
  timer.unref();
}
