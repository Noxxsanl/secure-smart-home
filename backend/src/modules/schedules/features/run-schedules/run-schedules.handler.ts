// Runner hẹn giờ (hợp đồng §3): mỗi tick giành quyền các lịch đến hạn rồi xử lý TỪNG lịch (try/catch riêng).
// Các bước xử lý một lịch (missed → NO_DEVICE → ACCESS_REVOKED → ALREADY_IN_STATE → sendDeviceCommand) nằm ở
// domain/execute-schedule.ts — dùng chung với Trợ lý AI (chạy ngay bước vừa xác nhận) nên hai đường không lệch nhau.
// Ở đây chỉ còn vòng tick: dọn lịch mồ côi, giành quyền theo lô, gọi executeScheduleNow cho từng lịch (notify: true).
import { executeScheduleNow } from "../../domain/execute-schedule";
import { CLAIM_BATCH_SIZE, claimDueSchedules, failInterruptedSchedules } from "../../infrastructure/schedule.repository";

/** Số lượt giành quyền tối đa mỗi tick (mỗi lượt ≤ CLAIM_BATCH_SIZE lịch) — chặn tick chạy vô hạn khi tồn đọng. */
const MAX_CLAIM_ROUNDS = 5;

let ticking = false;
let tickCount = 0;
/** Dọn lịch kẹt 'running' mỗi 12 tick (~1 phút) và ở tick đầu tiên (khi start). */
const RECOVER_EVERY_TICKS = 12;

/** Một tick của runner (5 s/lần). Không chạy chồng; không bao giờ ném lỗi. */
export async function runScheduleTick(): Promise<void> {
  if (ticking) return;
  ticking = true;
  try {
    // Các tick không chồng nhau và việc dọn nằm TRƯỚC khi giành quyền, nên (giả định MỘT tiến trình backend) mọi lịch
    // 'running' quá 10 phút ở đây đều mồ côi — tiến trình trước chết giữa chừng, kể cả khi backend khởi động lại ngay sau
    // lúc giành quyền. 10 phút > thời gian xử lý tối đa của một lượt 20 lịch (~5 phút).
    if (tickCount % RECOVER_EVERY_TICKS === 0) {
      const failed = await failInterruptedSchedules();
      if (failed > 0) console.warn(`[schedules] ${failed} interrupted schedule(s) marked failed`);
    }
    tickCount += 1;

    for (let round = 0; round < MAX_CLAIM_ROUNDS; round++) {
      const ids = await claimDueSchedules();
      for (const id of ids) await executeScheduleNow(id, { notify: true, claimed: true });
      if (ids.length < CLAIM_BATCH_SIZE) break;
    }
  } catch (err) {
    console.error("[schedules] tick failed:", err instanceof Error ? err.message : "unknown error");
  } finally {
    ticking = false;
  }
}
