// Giới hạn LỖI XÁC THỰC theo khoá `<ip>|<gateway_id>` (core/http/fail-limiter-key.ts) cho uplink WebSocket `/api/device/camera/live` (A1, hợp đồng A+B §4): 20 lỗi / 15 phút
// → từ chối upgrade bằng 429. Upgrade không đi qua express-rate-limit nên đếm tay, trong RAM.
// Vì sao theo ip|gateway_id mà không khoá gateway (và không chỉ theo IP: sau nginx không bật TRUST_PROXY mọi gateway chung IP): ai biết gateway_id cũng gửi được upgrade rác; khoá gateway theo số lần sai (như
// trước) cho kẻ ngoài khoá oan gateway thật (DoS). Chỉ lỗi xảy ra TRƯỚC khi chữ ký đúng mới được đếm — lỗi trạng thái
// sau xác thực (phiên không còn, uplink cũ chưa im) là bình thường khi gateway nối lại nên không được tính.
// Hàm nhận `now` để test không phụ thuộc đồng hồ; Map tự dọn mỗi 60 s ngay trong hàm gọi (không cần ticker) nên không rò bộ nhớ.

export const UPLINK_FAIL_WINDOW_MS = 15 * 60_000;
export const UPLINK_FAIL_MAX = 20;
const PRUNE_EVERY_MS = 60_000;

const failuresByKey = new Map<string, number[]>();
let lastPruneAt = 0;

function pruneIfDue(now: number): void {
  if (now - lastPruneAt < PRUNE_EVERY_MS) return;
  lastPruneAt = now;
  for (const [key, times] of failuresByKey) {
    const recent = times.filter((at) => now - at < UPLINK_FAIL_WINDOW_MS);
    if (recent.length === 0) failuresByKey.delete(key);
    else failuresByKey.set(key, recent);
  }
}

/** true = khoá này đã đủ UPLINK_FAIL_MAX lỗi trong 15 phút gần nhất → từ chối upgrade (429). */
export function isUplinkAuthBlocked(key: string, now: number): boolean {
  pruneIfDue(now);
  const times = failuresByKey.get(key);
  if (!times) return false;
  const recent = times.filter((at) => now - at < UPLINK_FAIL_WINDOW_MS);
  if (recent.length === 0) {
    failuresByKey.delete(key);
    return false;
  }
  failuresByKey.set(key, recent);
  return recent.length >= UPLINK_FAIL_MAX;
}

/** Ghi nhận một lỗi xác thực từ khoá `key`. Danh sách không dài quá UPLINK_FAIL_MAX (đủ để chặn, không phình khi bị dội). */
export function recordUplinkAuthFailure(key: string, now: number): void {
  pruneIfDue(now);
  const recent = (failuresByKey.get(key) ?? []).filter((at) => now - at < UPLINK_FAIL_WINDOW_MS);
  recent.push(now);
  if (recent.length > UPLINK_FAIL_MAX) recent.splice(0, recent.length - UPLINK_FAIL_MAX);
  failuresByKey.set(key, recent);
}

/** Chỉ cho test: xoá toàn bộ bộ đếm. */
export function resetUplinkFailLimiterForTest(): void {
  failuresByKey.clear();
  lastPruneAt = 0;
}
