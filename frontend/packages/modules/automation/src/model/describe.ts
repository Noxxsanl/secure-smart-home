import type { AutomationRule, HabitSuggestion, TriggerMetric } from "@shh/api-client/portal";
import { actionLabel, describeDays } from "./schedule";

export const METRIC_INFO: Record<TriggerMetric, { label: string; unit: string }> = {
  temperature: { label: "nhiệt độ", unit: "°C" },
  humidity: { label: "độ ẩm", unit: "%" },
};

/** Rule → câu "NẾU … THÌ …" (cảm biến) hoặc "LÚC … THÌ …" (lịch). Không bao giờ in id/mã thô. */
export function describeRule(rule: AutomationRule): { prefix: "NẾU" | "LÚC"; when: string; then: string } {
  const then = `${actionLabel(rule.action_command)} ${rule.action_device_name ?? "thiết bị đã bị xoá"}`;

  if (rule.trigger_type === "schedule") {
    return { prefix: "LÚC", when: `${rule.schedule_time ?? "—"}, ${describeDays(rule.schedule_days)}`, then };
  }

  const room = rule.trigger_room_name ?? "phòng đã bị xoá";
  const metric = rule.trigger_metric ? METRIC_INFO[rule.trigger_metric] : null;
  if (!metric || rule.trigger_operator === null || rule.trigger_threshold === null) {
    return { prefix: "NẾU", when: room, then };
  }
  return {
    prefix: "NẾU",
    when: `${room}: ${metric.label} ${rule.trigger_operator} ${rule.trigger_threshold}${metric.unit}`,
    then,
  };
}

/** Gợi ý thói quen (FR-7.4): "Bạn thường tắt Đèn phòng khách (Phòng khách) lúc 23:00 — 6/7 ngày gần nhất." */
export function describeSuggestion(s: HabitSuggestion): string {
  const where = s.room_name ? ` (${s.room_name})` : "";
  const verb = s.action === "turn_on" ? "bật" : "tắt";
  return `Bạn thường ${verb} ${s.device_name}${where} lúc ${s.time_of_day} — ${s.days_matched}/${s.window_days} ngày gần nhất.`;
}

/** Múi giờ của nhà dùng để chạy lịch (CONTRACT §0). */
export function timezoneLabel(timezone: string): string {
  return timezone === "Asia/Ho_Chi_Minh" ? "giờ Việt Nam (UTC+7)" : timezone;
}
