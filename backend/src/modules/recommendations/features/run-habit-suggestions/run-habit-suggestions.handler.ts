// Quét thói quen và tạo gợi ý (CONTRACT_V2 §6, FR-7.4 → 7.7). Thuật toán nằm ở domain/habit-pattern.ts.
//
//   Bỏ qua khi: đã có gợi ý pending/confirmed hoặc rule schedule đang bật cho cùng thiết bị+hành động
//   trong ±15 phút; bị từ chối trong 30 ngày gần nhất; nhà đã nhận gợi ý trong 24 giờ qua (tối đa 1/nhà/ngày).
//
// Invariant 8: job CHỈ ghi recommendation_history (pending) + thông báo. Không có đường nào từ đây tới
// sendDeviceCommand — gợi ý chỉ trở thành hành động khi người dùng chấp nhận và tạo ra một automation_rule.
import { DEFAULT_TIMEZONE, formatHhmm, parseHhmm } from "../../../../shared/time";
import { logEvent } from "../../../audit";
import { listEnabledScheduleTimes } from "../../../automation";
import { notifyHomeMembers } from "../../../notifications";
import {
  DAY_MS,
  HOME_COOLDOWN_HOURS,
  MATCH_RADIUS_MIN,
  MIN_DAYS_MATCHED,
  REJECTED_COOLDOWN_DAYS,
  WINDOW_DAYS,
  circularDiff,
  detectCandidates,
  type Candidate,
  type HomeInfo,
} from "../../domain/habit-pattern";
import type { HabitRunResult } from "../../domain/suggestion.types";
import { listActiveHomes, loadBehaviorEvents } from "../../infrastructure/habit.read-model";
import { hasSuggestionSince, insertSuggestion, listBlockingSuggestions } from "../../infrastructure/suggestions.repository";

/** Có gợi ý/rule/từ chối cản việc tạo gợi ý này không (cùng thiết bị + hành động, trong ±15 phút)? */
async function isSuppressed(home: HomeInfo, candidate: Candidate): Promise<boolean> {
  const rejectedSince = new Date(Date.now() - REJECTED_COOLDOWN_DAYS * DAY_MS);
  const suggestions = await listBlockingSuggestions(home.id, candidate.deviceId, candidate.action);
  for (const row of suggestions) {
    const minute = parseHhmm(row.time_of_day);
    if (minute === null || circularDiff(minute, candidate.minute) > MATCH_RADIUS_MIN) continue;
    if (row.status !== "rejected") return true;
    if (new Date(row.ref_at).getTime() >= rejectedSince.getTime()) return true;
  }

  const rules = await listEnabledScheduleTimes(home.id, candidate.deviceId, candidate.action);
  return rules.some((rule) => {
    const minute = rule.schedule_time_of_day ? parseHhmm(rule.schedule_time_of_day) : null;
    return minute !== null && circularDiff(minute, candidate.minute) <= MATCH_RADIUS_MIN;
  });
}

async function createSuggestion(home: HomeInfo, candidate: Candidate): Promise<void> {
  const time = formatHhmm(candidate.minute);
  const verbLower = candidate.action === "turn_on" ? "bật" : "tắt";
  const verb = candidate.action === "turn_on" ? "Bật" : "Tắt";
  const config = {
    name: `${verb} ${candidate.deviceName} lúc ${time}`,
    trigger_type: "schedule",
    schedule_time: time,
    schedule_days: [1, 2, 3, 4, 5, 6, 7],
    action_device_id: candidate.deviceId,
    action_command: candidate.action,
  };
  const recommendationId = await insertSuggestion({
    homeId: home.id,
    deviceId: candidate.deviceId,
    action: candidate.action,
    timeOfDay: time,
    daysMatched: candidate.daysMatched,
    windowDays: WINDOW_DAYS,
    config,
  });
  await logEvent({
    eventType: "SUGGESTION_CREATED",
    homeId: home.id,
    deviceId: candidate.deviceId,
    message: `Gợi ý thói quen: ${verbLower} ${candidate.deviceName} lúc ${time} (${candidate.daysMatched}/${WINDOW_DAYS} ngày)`,
    details: { recommendation_id: recommendationId, action: candidate.action, time_of_day: time, days_matched: candidate.daysMatched },
  });
  await notifyHomeMembers({
    homeId: home.id,
    roles: ["OWNER", "CONTROLLER"],
    type: "SUGGESTION_NEW",
    title: "Gợi ý tự động hoá mới",
    message: `${candidate.daysMatched}/${WINDOW_DAYS} ngày qua bạn ${verbLower} ${candidate.deviceName} vào khoảng ${time}. Bạn có muốn tạo lịch tự động không?`,
    severity: "info",
    relatedDeviceId: candidate.deviceId,
  });
}

async function scanHome(home: HomeInfo): Promise<boolean> {
  // Tối đa 1 gợi ý/nhà/ngày — tính trên MỌI trạng thái để người dùng không bị làm phiền liên tục
  if (await hasSuggestionSince(home.id, new Date(Date.now() - HOME_COOLDOWN_HOURS * 3600 * 1000))) return false;

  const events = await loadBehaviorEvents(home.id, new Date(Date.now() - WINDOW_DAYS * DAY_MS));
  if (events.length < MIN_DAYS_MATCHED) return false;

  for (const candidate of detectCandidates(home, events)) {
    if (await isSuppressed(home, candidate)) continue;
    await createSuggestion(home, candidate);
    return true;
  }
  return false;
}

let inFlight: Promise<HabitRunResult> | null = null;

/** Quét mọi nhà đang hoạt động một lần (cũng là handler của POST /api/dashboard/ai/suggestions/run). */
export function runHabitSuggestionsOnce(): Promise<HabitRunResult> {
  if (inFlight) return inFlight; // lần chạy tay trùng lần chạy định kỳ → dùng chung kết quả
  inFlight = (async (): Promise<HabitRunResult> => {
    const result: HabitRunResult = { homes_scanned: 0, suggestions_created: 0 };
    try {
      const homes = await listActiveHomes();
      for (const row of homes) {
        result.homes_scanned += 1;
        try {
          if (await scanHome({ id: row.id, timezone: row.timezone ?? DEFAULT_TIMEZONE })) result.suggestions_created += 1;
        } catch (err) {
          console.error("[habit] scan home failed:", err instanceof Error ? err.message : "unknown error");
        }
      }
    } catch (err) {
      console.error("[habit] run failed:", err instanceof Error ? err.message : "unknown error");
    }
    return result;
  })().finally(() => {
    inFlight = null;
  });
  return inFlight;
}
