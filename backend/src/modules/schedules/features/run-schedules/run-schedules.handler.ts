// Runner hẹn giờ (hợp đồng §3): mỗi tick giành quyền các lịch đến hạn rồi xử lý TỪNG lịch (try/catch riêng).
//
//   1. quá hạn > 5 phút (backend tắt đè qua giờ)        → missed, KHÔNG chạy bù, có thông báo
//   2. thiết bị đã xoá / không còn thuộc nhà của lịch    → failed NO_DEVICE
//   3. người tạo mất quyền control_device (tài khoản xoá/khoá, bị gỡ khỏi nhà, GUEST hết hạn…)
//                                                        → cancelled ACCESS_REVOKED, KHÔNG thông báo
//   4. thiết bị đã ở trạng thái đích                     → skipped ALREADY_IN_STATE
//   5. sendDeviceCommand(source schedule | ai_agent, channel system) → done | failed (mã lỗi của HttpError)
//
// sendDeviceCommand đã tự ghi device_commands, audit DEVICE_COMMAND(_FAILED) và user_behavior_logs nên runner KHÔNG ghi
// trùng. Quyền người tạo được kiểm lại bằng chính requireDeviceAccess của lệnh bấm tay (invariant 6). Mọi lỗi bắt tại
// chỗ — runner không bao giờ làm sập tiến trình; log chỉ có id lịch + mã lỗi (không dữ liệu nhạy cảm).
import { HttpError } from "../../../../shared/errors/http-error";
import { homeLocalParts } from "../../../../shared/time";
import type { Severity } from "../../../../shared/types/domain";
import { sendDeviceCommand } from "../../../control";
import { getDeviceRow, requireDeviceAccess } from "../../../devices";
import { loadCustomerAuthContext } from "../../../identity";
import { notifyUser } from "../../../notifications";
import { actionLabel, failureReasonText, isAlreadyInState, lowerFirst, normalizeErrorCode } from "../../domain/schedule-policy";
import type { DeviceCommandAction } from "../../../devices";
import type { ScheduleRow } from "../../domain/schedule.types";
import { getScheduleRow } from "../../infrastructure/schedule.read-model";
import {
  CLAIM_BATCH_SIZE,
  claimDueSchedules,
  failInterruptedSchedules,
  finishSchedule,
  type ScheduleOutcome,
} from "../../infrastructure/schedule.repository";

/** Lịch đến hạn quá lâu (hệ thống tạm dừng) thì bỏ lỡ thay vì chạy muộn bất ngờ. */
const MISSED_AFTER_MS = 5 * 60_000;
/** Số lượt giành quyền tối đa mỗi tick (mỗi lượt ≤ CLAIM_BATCH_SIZE lịch) — chặn tick chạy vô hạn khi tồn đọng. */
const MAX_CLAIM_ROUNDS = 5;

interface Notice {
  type: string;
  title: string;
  message: string;
  severity: Severity;
}

async function notifyCreator(row: ScheduleRow, notice: Notice): Promise<void> {
  if (row.created_by_user_id === null) return; // tài khoản người tạo đã xoá — không có ai để báo
  await notifyUser({
    userId: row.created_by_user_id,
    homeId: row.home_id,
    relatedDeviceId: row.device_id,
    ...notice,
  });
}

function buildNotice(row: ScheduleRow, outcome: ScheduleOutcome): Notice | null {
  const label = actionLabel(row.action, row.appliance, row.device_name);
  const hhmm = homeLocalParts(row.run_at, row.timezone).hhmm;
  switch (outcome.status) {
    case "done":
      return {
        type: "SCHEDULE_DONE",
        title: "Hẹn giờ đã chạy",
        message: `Đã ${lowerFirst(label)} lúc ${hhmm}.`,
        severity: "success",
      };
    case "skipped":
      return {
        type: "SCHEDULE_SKIPPED",
        title: "Hẹn giờ không cần chạy",
        message: `${row.device_name ?? "Thiết bị"} đã ở trạng thái mong muốn, không cần gửi lệnh.`,
        severity: "info",
      };
    case "failed":
      return {
        type: "SCHEDULE_FAILED",
        title: "Hẹn giờ không chạy được",
        message: `Không thực hiện được “${label}” lúc ${hhmm}: ${failureReasonText(outcome.errorCode ?? "UNKNOWN")}.`,
        severity: "warning",
      };
    case "missed":
      return {
        type: "SCHEDULE_MISSED",
        title: "Hẹn giờ bị bỏ lỡ",
        message: `Lịch “${label}” lúc ${hhmm} đã bị bỏ lỡ do hệ thống tạm dừng.`,
        severity: "warning",
      };
    case "cancelled":
      return null; // mất quyền: không báo
  }
}

/** Ghi kết quả rồi (nếu lưu được) thông báo cho người tạo. */
async function complete(row: ScheduleRow, outcome: ScheduleOutcome): Promise<void> {
  const saved = await finishSchedule(row.id, outcome);
  if (!saved) return; // lịch đã bị xử lý bởi đường khác — không thông báo trùng
  const notice = buildNotice(row, outcome);
  if (notice) await notifyCreator(row, notice);
}

async function runOne(id: number): Promise<void> {
  const row = await getScheduleRow(id);
  if (!row) return;

  // 1. Bỏ lỡ
  if (Date.now() - row.run_at.getTime() > MISSED_AFTER_MS) {
    await complete(row, { status: "missed" });
    return;
  }

  // 2. Thiết bị còn thuộc nhà của lịch?
  const found = row.device_id === null ? null : await getDeviceRow(row.device_id);
  if (!found || found.home_id !== row.home_id) {
    await complete(row, { status: "failed", errorCode: "NO_DEVICE" });
    return;
  }

  // 3. Người tạo còn quyền điều khiển? (dựng lại AuthContext rồi dùng đúng luật lệnh bấm tay)
  const auth =
    row.created_by_user_id === null ? null : await loadCustomerAuthContext(row.created_by_user_id, row.channel === "mobile" ? "mobile" : "portal");
  if (auth === null) {
    await complete(row, { status: "cancelled", errorCode: "ACCESS_REVOKED" });
    return;
  }
  let device;
  try {
    ({ device } = await requireDeviceAccess(auth, found.id, "control_device"));
  } catch (err) {
    if (err instanceof HttpError && (err.status === 403 || err.status === 404)) {
      await complete(row, { status: "cancelled", errorCode: "ACCESS_REVOKED" });
      return;
    }
    throw err;
  }

  // 4. Đã đúng trạng thái → không gửi lệnh thừa
  if (isAlreadyInState(row.action, device)) {
    await complete(row, { status: "skipped", errorCode: "ALREADY_IN_STATE" });
    return;
  }

  // 5. Gửi lệnh
  try {
    const result = await sendDeviceCommand({
      deviceId: device.id,
      action: row.action as DeviceCommandAction,
      issuedBy: row.created_by_user_id,
      source: row.origin === "ai_agent" ? "ai_agent" : "schedule",
      channel: "system",
    });
    await complete(row, { status: "done", deviceCommandId: result.command.id });
  } catch (err) {
    const code = err instanceof HttpError ? normalizeErrorCode(err.code) : "UNKNOWN";
    await complete(row, { status: "failed", errorCode: code });
  }
}

/** Xử lý một lịch đã giành quyền; lỗi bất ngờ → failed UNKNOWN (không để lịch kẹt 'running'). */
async function runOneSafely(id: number): Promise<void> {
  try {
    await runOne(id);
  } catch (err) {
    console.error(`[schedules] schedule ${id} failed:`, err instanceof Error ? err.message : "unknown error");
    try {
      const row = await getScheduleRow(id);
      if (row) await complete(row, { status: "failed", errorCode: "UNKNOWN" });
    } catch {
      // DB hỏng: lịch kẹt 'running' sẽ được failInterruptedSchedules dọn sau 10 phút
    }
  }
}

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
      for (const id of ids) await runOneSafely(id);
      if (ids.length < CLAIM_BATCH_SIZE) break;
    }
  } catch (err) {
    console.error("[schedules] tick failed:", err instanceof Error ? err.message : "unknown error");
  } finally {
    ticking = false;
  }
}
