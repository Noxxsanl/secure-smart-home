// Quyền truy cập của vai trò Khách (GUEST, FR-6.3): có hạn ≤ 30 ngày và chỉ
// trên các thiết bị được chỉ định (CONTRACT §4.2: POST /homes/:id/members/invite).

export const GUEST_DURATIONS: { days: number; label: string }[] = [
  { days: 1, label: "1 ngày" },
  { days: 3, label: "3 ngày" },
  { days: 7, label: "7 ngày" },
  { days: 14, label: "14 ngày" },
  { days: 30, label: "30 ngày" },
];

export const DEFAULT_GUEST_DAYS = 7;

const DAY_MS = 86_400_000;
// Backend từ chối hạn > now + 30 ngày. Đồng hồ trình duyệt có thể nhanh hơn máy chủ
// vài phút nên chừa 10 phút ở mốc 30 ngày để lời mời không bị từ chối oan.
const MAX_GUEST_MS = 30 * DAY_MS - 10 * 60_000;

/** Thời điểm hết hạn (ISO UTC) cho khách được cấp quyền `days` ngày kể từ bây giờ. */
export function guestExpiresAt(days: number): string {
  return new Date(Date.now() + Math.min(days * DAY_MS, MAX_GUEST_MS)).toISOString();
}
