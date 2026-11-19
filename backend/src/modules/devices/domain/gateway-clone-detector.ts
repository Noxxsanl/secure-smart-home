// Phát hiện Gateway nghi bị NHÂN BẢN (hai board dùng chung chứng chỉ mTLS + secret) từ heartbeat — hàm THUẦN theo
// trạng thái trong RAM của từng gateway, để test không cần DB/MQTT (hợp đồng A+B §4, A2).
//
// Hai board cùng danh tính cùng gửi heartbeat hợp lệ lên một topic nên backend thấy các dấu hiệu:
//   UPTIME_REGRESSION  uptime lùi (mới < trước − 5 s) ≥ 2 lần trong 10 phút — board này mới bật xen kẽ board kia;
//   IP_FLAPPING        `ip` đổi ≥ 3 lần trong 10 phút giữa ≥ 2 giá trị khác nhau — hai board ở hai địa chỉ luân phiên;
//   COUNTER_REPLAY     ≥ 3 heartbeat ĐÚNG chữ ký nhưng bị từ chối vì ctr ≤ last_ctr trong 10 phút — hai bộ đếm đua nhau
//                      (chỉ người có secret mới ký đúng nên đây không phải kẻ phát lại ngoài).
// Cảnh báo tối đa 1 lần / gateway / giờ (cooldown) để không ngập audit/thông báo.
// Đây là dấu hiệu NGHI, không phải bằng chứng: gateway khởi động lại 2 lần / 10 phút, hoặc NVS bị xoá mà chưa chạy lại
// `npm run hw:register` (ctr lùi) cũng cho tín hiệu y hệt — nên mức cảnh báo là warning, không phải critical.
// Bộ nhớ có trần: mỗi mảng mốc chỉ giữ tối đa đúng số phần tử bằng ngưỡng báo (giữ phần tử MỚI nhất), và trong cooldown
// không tích luỹ mốc nào (mảng được dọn) — heartbeat đến mỗi 15–30 s nên không thể để mảng phình theo thời gian.
// Chỉ gọi với heartbeat ĐÃ qua chữ ký (kẻ ngoài không có secret không kích hoạt được cảnh báo giả). Trạng thái chỉ
// trong RAM: khởi động lại thì học lại từ đầu — chấp nhận được vì dấu hiệu lặp lại liên tục khi còn nhân bản.

export const CLONE_WINDOW_MS = 10 * 60_000;
export const CLONE_ALERT_COOLDOWN_MS = 60 * 60_000;
/** uptime lùi quá ngưỡng này mới tính (heartbeat đến lệch thứ tự / làm tròn không phải lùi). */
export const UPTIME_REGRESSION_TOLERANCE_S = 5;
export const UPTIME_REGRESSIONS_TO_ALERT = 2;
export const IP_CHANGES_TO_ALERT = 3;
export const COUNTER_REPLAYS_TO_ALERT = 3;

export type CloneSignal = "UPTIME_REGRESSION" | "IP_FLAPPING" | "COUNTER_REPLAY";

export interface GatewayCloneState {
  lastUptime: number | null;
  lastIp: string | null;
  /** Thời điểm (ms) mỗi lần uptime lùi. */
  uptimeRegressions: number[];
  /** Mỗi lần ip đổi: thời điểm + ip MỚI. */
  ipChanges: { at: number; ip: string }[];
  /** Thời điểm (ms) mỗi heartbeat đúng chữ ký bị từ chối vì ctr phát lại. */
  counterReplays: number[];
  lastAlertAt: number | null;
}

export function createCloneState(): GatewayCloneState {
  return { lastUptime: null, lastIp: null, uptimeRegressions: [], ipChanges: [], counterReplays: [], lastAlertAt: null };
}

/** Lọc theo cửa sổ 10 phút rồi chỉ giữ `cap` phần tử cuối (đủ để so với ngưỡng, không phình). */
function recent(times: number[], now: number, cap: number): number[] {
  const inWindow = times.filter((at) => now - at < CLONE_WINDOW_MS);
  return inWindow.length > cap ? inWindow.slice(inWindow.length - cap) : inWindow;
}

function inCooldown(state: GatewayCloneState, now: number): boolean {
  return state.lastAlertAt !== null && now - state.lastAlertAt < CLONE_ALERT_COOLDOWN_MS;
}

/** Áp cooldown: trả tín hiệu và đánh dấu đã cảnh báo; còn trong cooldown → null. */
function raise(state: GatewayCloneState, signal: CloneSignal | null, now: number): CloneSignal | null {
  if (signal === null) return null;
  if (inCooldown(state, now)) return null;
  state.lastAlertAt = now;
  return signal;
}

/**
 * Ghi nhận một heartbeat HỢP LỆ (đúng chữ ký, ctr mới). `uptime`/`ip` null = heartbeat không báo trường đó
 * (giữ giá trị trước, không tính là đổi). Trả tín hiệu nếu vừa vượt ngưỡng và chưa trong cooldown.
 */
export function observeHeartbeat(
  state: GatewayCloneState,
  obs: { at: number; uptime: number | null; ip: string | null }
): CloneSignal | null {
  const { at } = obs;
  let signal: CloneSignal | null = null;

  if (obs.uptime !== null) {
    if (state.lastUptime !== null && obs.uptime < state.lastUptime - UPTIME_REGRESSION_TOLERANCE_S) {
      state.uptimeRegressions.push(at);
    }
    state.lastUptime = obs.uptime;
  }
  // Trong cooldown vẫn theo dõi lastUptime/lastIp (để hết cooldown so sánh đúng) nhưng không tích luỹ mốc cảnh báo
  state.uptimeRegressions = inCooldown(state, at) ? [] : recent(state.uptimeRegressions, at, UPTIME_REGRESSIONS_TO_ALERT);
  if (state.uptimeRegressions.length >= UPTIME_REGRESSIONS_TO_ALERT) signal = "UPTIME_REGRESSION";

  if (obs.ip !== null) {
    if (state.lastIp !== null && obs.ip !== state.lastIp) state.ipChanges.push({ at, ip: obs.ip });
    state.lastIp = obs.ip;
  }
  if (inCooldown(state, at)) {
    state.ipChanges = [];
  } else {
    const inWindow = state.ipChanges.filter((c) => at - c.at < CLONE_WINDOW_MS);
    state.ipChanges = inWindow.length > IP_CHANGES_TO_ALERT ? inWindow.slice(inWindow.length - IP_CHANGES_TO_ALERT) : inWindow;
  }
  if (signal === null && state.ipChanges.length >= IP_CHANGES_TO_ALERT) {
    // ≥ 2 giá trị khác nhau: mỗi lần đổi là sang ip khác ip liền trước nên chỉ cần gộp thêm ip đang giữ
    const distinct = new Set(state.ipChanges.map((c) => c.ip));
    if (state.lastIp !== null) distinct.add(state.lastIp);
    if (distinct.size >= 2) signal = "IP_FLAPPING";
  }

  return raise(state, signal, at);
}

/** Ghi nhận một heartbeat ĐÚNG chữ ký nhưng bị từ chối vì ctr phát lại / lùi. */
export function observeCounterReplay(state: GatewayCloneState, at: number): CloneSignal | null {
  if (inCooldown(state, at)) {
    state.counterReplays = [];
    return null;
  }
  state.counterReplays.push(at);
  state.counterReplays = recent(state.counterReplays, at, COUNTER_REPLAYS_TO_ALERT);
  return raise(state, state.counterReplays.length >= COUNTER_REPLAYS_TO_ALERT ? "COUNTER_REPLAY" : null, at);
}

// ── Sổ trạng thái theo gateway (RAM) ────────────────────────────────────────

const states = new Map<number, GatewayCloneState>();
const MAX_TRACKED_GATEWAYS = 5000;

/** Trạng thái của gateway (devices.id); tạo mới khi chưa có. Trần số gateway để Map không phình vô hạn. */
export function cloneStateFor(gatewayDbId: number): GatewayCloneState {
  let state = states.get(gatewayDbId);
  if (!state) {
    if (states.size >= MAX_TRACKED_GATEWAYS) {
      const oldest = states.keys().next();
      if (!oldest.done) states.delete(oldest.value);
    }
    state = createCloneState();
    states.set(gatewayDbId, state);
  }
  return state;
}
