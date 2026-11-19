// Thuật toán thống kê tìm thói quen (CONTRACT_V2 §6, FR-7.4 → 7.7) — thuần, không đụng DB.
//
// Không phải mô hình ML (đủ cho yêu cầu "gợi ý có giải thích được"):
//   Với mỗi nhà đang hoạt động, mỗi cặp (relay, hành động) trong user_behavior_logs 7 ngày gần nhất do NGƯỜI
//   thao tác (source mobile/manual — automation và AI không tính, kẻo gợi ý tự nuôi chính nó):
//     1. tìm mốc phút t sao cho có hành động trong ±15 phút quanh t ở ≥ 5 NGÀY khác nhau (giờ địa phương);
//     2. giờ gợi ý = trung vị các phút khớp (làm tròn 5 phút) — tính theo độ lệch có dấu so với t nên
//        đúng cả khi thói quen vắt qua nửa đêm.
import { homeLocalParts } from "../../../shared/time";

export const WINDOW_DAYS = 7;
export const MIN_DAYS_MATCHED = 5;
export const MATCH_RADIUS_MIN = 15;
export const REJECTED_COOLDOWN_DAYS = 30;
export const HOME_COOLDOWN_HOURS = 24;
export const DAY_MS = 24 * 3600 * 1000;

export interface HomeInfo {
  id: number;
  timezone: string;
}

export interface BehaviorEvent {
  device_id: number;
  device_name: string;
  action: string;
  timestamp: Date;
}

export interface Candidate {
  deviceId: number;
  deviceName: string;
  action: "turn_on" | "turn_off";
  minute: number; // đã làm tròn 5 phút, 0–1439
  daysMatched: number;
}

/** Khoảng cách vòng trên đồng hồ 24 giờ (23:55 và 00:05 cách nhau 10 phút). */
export function circularDiff(a: number, b: number): number {
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

export function detectCandidates(home: HomeInfo, events: BehaviorEvent[]): Candidate[] {
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
