// Thực thi MỘT lịch hẹn giờ (hợp đồng giai đoạn 1 §3) — dùng chung cho worker scheduleRunner và cho Trợ lý AI
// (chạy ngay các bước người dùng vừa xác nhận). Hai đường chung đúng một đường mã nên không lệch hành vi:
//
//   1. quá hạn > 5 phút (backend tắt đè qua giờ)        → missed, KHÔNG chạy bù, có thông báo
//   2. thiết bị đã xoá / không còn thuộc nhà của lịch    → failed NO_DEVICE
//   3. người tạo mất quyền control_device (tài khoản xoá/khoá, bị gỡ khỏi nhà, GUEST hết hạn…)
//                                                        → cancelled ACCESS_REVOKED, KHÔNG thông báo
//   4. thiết bị đã ở trạng thái đích                     → skipped ALREADY_IN_STATE
//   5. sendDeviceCommand(source schedule | ai_agent, channel system) → done | failed (mã lỗi của HttpError)
//
// sendDeviceCommand đã tự ghi device_commands, audit DEVICE_COMMAND(_FAILED) và user_behavior_logs nên đây KHÔNG ghi
// trùng. Quyền người tạo được kiểm lại bằng chính requireDeviceAccess của lệnh bấm tay (invariant 6). Mọi lỗi bắt tại
// chỗ — không bao giờ làm sập tiến trình; log chỉ có id lịch + mã lỗi (không dữ liệu nhạy cảm). KHÔNG giữ transaction
// trong lúc chờ ack thiết bị: người gọi phải gọi sau khi đã commit.
import { HttpError } from "../../../shared/errors/http-error";
import { homeLocalParts } from "../../../shared/time";
import type { Severity } from "../../../shared/types/domain";
import { sendDeviceCommand } from "../../control";
import { getDeviceRow, requireDeviceAccess } from "../../devices";
import type { DeviceCommandAction } from "../../devices";
import { loadCustomerAuthContext } from "../../identity";
import { notifyUser } from "../../notifications";
import { getScheduleRow } from "../infrastructure/schedule.read-model";
import { claimScheduleById, finishSchedule, type ScheduleOutcome } from "../infrastructure/schedule.repository";
import type { ScheduleRow } from "./schedule.types";
import { actionLabel, failureReasonText, isAlreadyInState, lowerFirst, normalizeErrorCode } from "./schedule-policy";

/** Lịch đến hạn quá lâu (hệ thống tạm dừng) thì bỏ lỡ thay vì chạy muộn bất ngờ. */
const MISSED_AFTER_MS = 5 * 60_000;

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

/** Ghi kết quả rồi (nếu lưu được và `notify`) thông báo cho người tạo. */
async function complete(row: ScheduleRow, outcome: ScheduleOutcome, notify: boolean): Promise<void> {
  const saved = await finishSchedule(row.id, outcome);
  if (!saved || !notify) return; // lịch đã bị xử lý bởi đường khác — không thông báo trùng
  const notice = buildNotice(row, outcome);
  if (notice) await notifyCreator(row, notice);
}

async function runOne(id: number, notify: boolean): Promise<void> {
  const row = await getScheduleRow(id);
  if (!row) return;

  // 1. Bỏ lỡ
  if (Date.now() - row.run_at.getTime() > MISSED_AFTER_MS) {
    await complete(row, { status: "missed" }, notify);
    return;
  }

  // 2. Thiết bị còn thuộc nhà của lịch?
  const found = row.device_id === null ? null : await getDeviceRow(row.device_id);
  if (!found || found.home_id !== row.home_id) {
    await complete(row, { status: "failed", errorCode: "NO_DEVICE" }, notify);
    return;
  }

  // 3. Người tạo còn quyền điều khiển? (dựng lại AuthContext rồi dùng đúng luật lệnh bấm tay)
  const auth =
    row.created_by_user_id === null ? null : await loadCustomerAuthContext(row.created_by_user_id, row.channel === "mobile" ? "mobile" : "portal");
  if (auth === null) {
    await complete(row, { status: "cancelled", errorCode: "ACCESS_REVOKED" }, notify);
    return;
  }
  let device;
  try {
    ({ device } = await requireDeviceAccess(auth, found.id, "control_device"));
  } catch (err) {
    if (err instanceof HttpError && (err.status === 403 || err.status === 404)) {
      await complete(row, { status: "cancelled", errorCode: "ACCESS_REVOKED" }, notify);
      return;
    }
    throw err;
  }

  // 4. Đã đúng trạng thái → không gửi lệnh thừa
  if (isAlreadyInState(row.action, device)) {
    await complete(row, { status: "skipped", errorCode: "ALREADY_IN_STATE" }, notify);
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
    await complete(row, { status: "done", deviceCommandId: result.command.id }, notify);
  } catch (err) {
    const code = err instanceof HttpError ? normalizeErrorCode(err.code) : "UNKNOWN";
    await complete(row, { status: "failed", errorCode: code }, notify);
  }
}

export interface ExecuteScheduleOptions {
  /** true = thông báo kết quả cho người tạo (worker); false = người gọi tự báo kết quả (Trợ lý AI vừa trả response). */
  notify: boolean;
  /**
   * true = người gọi ĐÃ giành quyền (scheduled → running), vd claimDueSchedules của worker theo lô. false (mặc định)
   * = hàm tự giành quyền theo id; lịch đã bị worker/huỷ xử lý trước thì không chạy.
   */
  claimed?: boolean;
}

/**
 * Thực thi một lịch ngay: (giành quyền scheduled → running nếu chưa) rồi chạy các bước 1–5 ở đầu file. Lỗi bất ngờ → failed
 * UNKNOWN (không để lịch kẹt 'running'). Không bao giờ ném lỗi. Trả true nếu lịch được chạy ở lời gọi này.
 * Người gọi chỉ nên gọi cho lịch đã đến hạn (run_at ≤ now + vài giây) — hàm KHÔNG kiểm run_at ở bước giành quyền.
 */
export async function executeScheduleNow(id: number, opts: ExecuteScheduleOptions): Promise<boolean> {
  try {
    if (opts.claimed !== true && !(await claimScheduleById(id))) return false;
  } catch (err) {
    console.error(`[schedules] schedule ${id} claim failed:`, err instanceof Error ? err.message : "unknown error");
    return false;
  }
  try {
    await runOne(id, opts.notify);
  } catch (err) {
    console.error(`[schedules] schedule ${id} failed:`, err instanceof Error ? err.message : "unknown error");
    try {
      const row = await getScheduleRow(id);
      if (row) await complete(row, { status: "failed", errorCode: "UNKNOWN" }, opts.notify);
    } catch {
      // DB hỏng: lịch kẹt 'running' sẽ được failInterruptedSchedules dọn sau 10 phút
    }
  }
  return true;
}

/**
 * Chạy ngay một lô lịch "chạy ngay" mà người gọi ĐÃ chèn thẳng 'running' (startRunning) trong transaction của mình: song song
 * giữa các thiết bị khác nhau (không để một thiết bị chậm ack làm chậm cả lô), tuần tự theo thứ tự `items` trên cùng một
 * thiết bị (hai lệnh cho một thiết bị không được đua nhau). Dùng cho Trợ lý AI: lệnh rõ chạy ngay (create) và bước đã xác
 * nhận (confirm) đi chung một đường. Gọi SAU commit. Không bao giờ ném lỗi (executeScheduleNow đã bắt hết).
 */
export async function executeSchedulesNow(items: readonly { id: number; deviceId: number }[]): Promise<void> {
  const byDevice = new Map<number, number[]>();
  for (const { id, deviceId } of items) byDevice.set(deviceId, [...(byDevice.get(deviceId) ?? []), id]);
  await Promise.all(
    [...byDevice.values()].map(async (ids) => {
      for (const id of ids) await executeScheduleNow(id, { notify: false, claimed: true });
    })
  );
}
