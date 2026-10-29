// Job gợi ý thói quen (CONTRACT_V2 §6, FR-7.4 → 7.7).
//
// Thuật toán thống kê, không phải mô hình ML (đủ cho yêu cầu "gợi ý có giải thích được"):
//   Với mỗi nhà đang hoạt động, mỗi cặp (relay, hành động) trong user_behavior_logs 7 ngày gần nhất do NGƯỜI
//   thao tác (source mobile/manual — automation và AI không tính, kẻo gợi ý tự nuôi chính nó):
//     1. tìm mốc phút t sao cho có hành động trong ±15 phút quanh t ở ≥ 5 NGÀY khác nhau (giờ địa phương);
//     2. giờ gợi ý = trung vị các phút khớp (làm tròn 5 phút) — tính theo độ lệch có dấu so với t nên
//        đúng cả khi thói quen vắt qua nửa đêm.
//   Bỏ qua khi: đã có gợi ý pending/confirmed hoặc rule schedule đang bật cho cùng thiết bị+hành động
//   trong ±15 phút; bị từ chối trong 30 ngày gần nhất; nhà đã nhận gợi ý trong 24 giờ qua (tối đa 1/nhà/ngày).
//
// Invariant 8: job CHỈ ghi recommendation_history (pending) + thông báo. Không có đường nào từ đây tới
// sendDeviceCommand — gợi ý chỉ trở thành hành động khi người dùng chấp nhận và tạo ra một automation_rule.
import { queryRows, runSql } from "../../lib/db";
import { DEFAULT_TIMEZONE, formatHhmm, homeLocalParts, parseHhmm } from "../../lib/time";
import { logEvent } from "../logs/logEvent";
import { notifyHomeMembers } from "../notifications/notification.service";

const WINDOW_DAYS = 7;
const MIN_DAYS_MATCHED = 5;
const MATCH_RADIUS_MIN = 15;
const REJECTED_COOLDOWN_DAYS = 30;
const HOME_COOLDOWN_HOURS = 24;
const FIRST_RUN_DELAY_MS = 60_000;
const RUN_INTERVAL_MS = 6 * 3600 * 1000;
const DAY_MS = 24 * 3600 * 1000;

export interface HabitRunResult {
  homes_scanned: number;
  suggestions_created: number;
}

interface HomeInfo {
  id: number;
  timezone: string;
}

interface BehaviorEvent {
  device_id: number;
  device_name: string;
  action: string;
  timestamp: Date;
}

interface Candidate {
  deviceId: number;
  deviceName: string;
  action: "turn_on" | "turn_off";
  minute: number; // đã làm tròn 5 phút, 0–1439
  daysMatched: number;
}

/** Khoảng cách vòng trên đồng hồ 24 giờ (23:55 và 00:05 cách nhau 10 phút). */
function circularDiff(a: number, b: number): number {
  const raw = Math.abs(a - b) % 1440;
  return Math.min(raw, 1440 - raw);
}

/** Độ lệch có dấu của `minute` so với `anchor`, trong (-720, 720]. */
function signedDiff(minute: number, anchor: number): number {
  let diff = (minute - anchor) % 1440;
  if (diff > 720) diff -= 1440;
  if (diff <= -720) diff += 1440;
  return diff;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Tìm mốc giờ tốt nhất của một nhóm (thiết bị, hành động); null nếu chưa đủ 5 ngày. */
function findPattern(events: { minute: number; date: string }[]): { minute: number; daysMatched: number } | null {
  let best: { anchor: number; dates: Map<string, number> } | null = null;
  for (const candidate of new Set(events.map((event) => event.minute))) {
    // Mỗi ngày giữ sự kiện GẦN mốc nhất (một ngày có thể bật/tắt nhiều lần)
    const perDate = new Map<string, number>();
    for (const event of events) {
      if (circularDiff(event.minute, candidate) > MATCH_RADIUS_MIN) continue;
      const delta = signedDiff(event.minute, candidate);
      const kept = perDate.get(event.date);
      if (kept === undefined || Math.abs(delta) < Math.abs(kept)) perDate.set(event.date, delta);
    }
    if (best === null || perDate.size > best.dates.size) best = { anchor: candidate, dates: perDate };
  }
  if (best === null || best.dates.size < MIN_DAYS_MATCHED) return null;
  const centre = median([...best.dates.values()]);
  const rounded = Math.round((best.anchor + centre) / 5) * 5;
  return { minute: ((rounded % 1440) + 1440) % 1440, daysMatched: best.dates.size };
}

async function loadEvents(home: HomeInfo, since: Date): Promise<BehaviorEvent[]> {
  // Join thiết bị để chỉ xét relay còn tồn tại của ĐÚNG nhà này (NFR-S4: truy vấn theo nhà)
  return queryRows<BehaviorEvent>(
    `SELECT l.device_id, d.device_name, l.action, l."timestamp"
       FROM user_behavior_logs l
       JOIN devices d ON d.id = l.device_id AND d.home_id = l.smart_home_id AND d.category = 'relay'
      WHERE l.smart_home_id = ? AND l."timestamp" >= ? AND l.source IN ('mobile', 'manual')
        AND l.action IN ('TURN_ON', 'TURN_OFF')`,
    [home.id, since]
  );
}

function detectCandidates(home: HomeInfo, events: BehaviorEvent[]): Candidate[] {
  const groups = new Map<string, { deviceId: number; deviceName: string; action: "turn_on" | "turn_off"; items: { minute: number; date: string }[] }>();
  for (const event of events) {
    const action = event.action === "TURN_ON" ? "turn_on" : "turn_off";
    const key = `${event.device_id}:${action}`;
    const local = homeLocalParts(new Date(event.timestamp), home.timezone);
    const group = groups.get(key) ?? { deviceId: event.device_id, deviceName: event.device_name, action, items: [] };
    group.items.push({ minute: local.minuteOfDay, date: local.dateKey });
    groups.set(key, group);
  }

  const candidates: Candidate[] = [];
  for (const group of groups.values()) {
    const pattern = findPattern(group.items);
    if (pattern) {
      candidates.push({
        deviceId: group.deviceId,
        deviceName: group.deviceName,
        action: group.action,
        minute: pattern.minute,
        daysMatched: pattern.daysMatched,
      });
    }
  }
  // Thói quen đều đặn nhất trước (nhiều ngày khớp hơn), hoà thì theo thiết bị cho kết quả ổn định
  return candidates.sort((a, b) => b.daysMatched - a.daysMatched || a.deviceId - b.deviceId);
}

/** Có gợi ý/rule/từ chối cản việc tạo gợi ý này không (cùng thiết bị + hành động, trong ±15 phút)? */
async function isSuppressed(home: HomeInfo, candidate: Candidate): Promise<boolean> {
  const rejectedSince = new Date(Date.now() - REJECTED_COOLDOWN_DAYS * DAY_MS);
  const suggestions = await queryRows<{ time_of_day: string; status: string; ref_at: Date }>(
    `SELECT time_of_day, status, COALESCE(responded_at, presented_at) AS ref_at
       FROM recommendation_history
      WHERE home_id = ? AND device_id = ? AND action = ? AND status IN ('pending', 'confirmed', 'rejected')`,
    [home.id, candidate.deviceId, candidate.action]
  );
  for (const row of suggestions) {
    const minute = parseHhmm(row.time_of_day);
    if (minute === null || circularDiff(minute, candidate.minute) > MATCH_RADIUS_MIN) continue;
    if (row.status !== "rejected") return true;
    if (new Date(row.ref_at).getTime() >= rejectedSince.getTime()) return true;
  }

  const rules = await queryRows<{ schedule_time_of_day: string | null }>(
    `SELECT schedule_time_of_day FROM automation_rules
      WHERE home_id = ? AND is_enabled = TRUE AND trigger_type = 'schedule'
        AND action_device_id = ? AND action_command = ?`,
    [home.id, candidate.deviceId, candidate.action]
  );
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
  const result = await runSql(
    `INSERT INTO recommendation_history
       (home_id, device_id, action, time_of_day, days_matched, window_days, suggested_rule_config, status, presented_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?)
     RETURNING id`,
    [home.id, candidate.deviceId, candidate.action, time, candidate.daysMatched, WINDOW_DAYS, JSON.stringify(config), new Date()]
  );
  await logEvent({
    eventType: "SUGGESTION_CREATED",
    homeId: home.id,
    deviceId: candidate.deviceId,
    message: `Gợi ý thói quen: ${verbLower} ${candidate.deviceName} lúc ${time} (${candidate.daysMatched}/${WINDOW_DAYS} ngày)`,
    details: { recommendation_id: result.insertId, action: candidate.action, time_of_day: time, days_matched: candidate.daysMatched },
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
  const recent = await queryRows<{ id: number }>(
    "SELECT id FROM recommendation_history WHERE home_id = ? AND presented_at >= ? LIMIT 1",
    [home.id, new Date(Date.now() - HOME_COOLDOWN_HOURS * 3600 * 1000)]
  );
  if (recent.length > 0) return false;

  const events = await loadEvents(home, new Date(Date.now() - WINDOW_DAYS * DAY_MS));
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
      const homes = await queryRows<{ id: number; timezone: string | null }>(
        "SELECT id, timezone FROM smart_homes WHERE status = 'active' ORDER BY id"
      );
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

let started = false;

export function startHabitSuggestionJob(): void {
  if (started) return;
  started = true;
  const first = setTimeout(() => {
    void runHabitSuggestionsOnce();
    const timer = setInterval(() => void runHabitSuggestionsOnce(), RUN_INTERVAL_MS);
    timer.unref();
  }, FIRST_RUN_DELAY_MS);
  first.unref();
}
