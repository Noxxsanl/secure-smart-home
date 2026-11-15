// Luật quyết định TỪNG BƯỚC của Trợ lý AI (hợp đồng §2.4) — tất định, ở backend, KHÔNG tin agent. Bước hợp lệ thì
//   · người dùng NÓI RÕ (explicit-step.ts) + không có giờ → CHẠY NGAY (runNow);
//   · người dùng NÓI RÕ + có giờ                           → TỰ HẸN GIỜ (autoSchedule; huỷ được tới lúc chạy);
//   · còn lại (AI tự suy ra, mơ hồ thiết bị, thiếu động từ…) → CHỜ XÁC NHẬN (pending).
// Bước sai không làm hỏng cả request: vào `rejected`. Quyền đi qua đúng requireDeviceAccess của lệnh bấm tay (bất biến 6),
// và giờ hẹn vẫn phải nằm trong [30 s, 7 ngày] (resolveWhen).
import type { AuthContext } from "../../../core/auth/auth-context";
import { HttpError } from "../../../shared/errors/http-error";
import { requireDeviceAccess } from "../../devices";
import type { DeviceRow } from "../../devices";
import { assertHomeWritable } from "../../homes";
import { isActionAllowed, isSchedulableDevice, resolveWhen, toCommandAction } from "../../schedules";
import type { AgentRejectCode, AgentStepInput, PendingStep, RejectedStep } from "./agent.types";
import { isExplicitStep } from "./explicit-step";
import type { ExplicitStepDevice, ExplicitStepWhen } from "./explicit-step";
import { parseHhmm } from "../../../shared/time";

/** Thẻ xác nhận hết hạn sau 5 phút. */
export const PENDING_TTL_MS = 5 * 60_000;

export type DeviceCheck =
  | { ok: true; device: DeviceRow }
  | { ok: false; code: "NOT_FOUND" | "FORBIDDEN" | "HOME_SUSPENDED" };

/**
 * Quyền điều khiển thiết bị trong ĐÚNG nhà `homeId`: requireDeviceAccess(control_device) (404 → NOT_FOUND, 403 → FORBIDDEN),
 * thiết bị thuộc nhà khác → NOT_FOUND (không lộ), nhà suspended → HOME_SUSPENDED. Lỗi khác (DB…) ném tiếp.
 */
export async function checkDeviceControl(auth: AuthContext, homeId: number, deviceId: number): Promise<DeviceCheck> {
  try {
    const { device, access } = await requireDeviceAccess(auth, deviceId, "control_device");
    if (device.home_id !== homeId) return { ok: false, code: "NOT_FOUND" };
    assertHomeWritable(access.home);
    return { ok: true, device };
  } catch (err) {
    if (err instanceof HttpError) {
      if (err.status === 404) return { ok: false, code: "NOT_FOUND" };
      if (err.status === 403) return { ok: false, code: "FORBIDDEN" };
      if (err.code === "HOME_SUSPENDED") return { ok: false, code: "HOME_SUSPENDED" };
    }
    throw err;
  }
}

/**
 * when của bước → dạng isExplicitStep so với giờ người dùng nói. `at` là "HH:MM" (đã qua parseWhen nên luôn hợp lệ; nếu lạ thì
 * 00:00 — không thể khớp giờ nào người dùng nói trừ "0 giờ"). Không kiểm date/day_offset (sai ngày thì resolveWhen loại INVALID_WHEN).
 */
function toExplicitWhen(when: AgentStepInput["when"]): ExplicitStepWhen {
  if (when.kind === "now") return { kind: "now" };
  if ("afterMinutes" in when.when) return { kind: "after", minutes: when.when.afterMinutes };
  const minuteOfDay = parseHhmm(when.when.at) ?? 0;
  return { kind: "at", hour: Math.floor(minuteOfDay / 60), minute: minuteOfDay % 60 };
}

/** Bước đã hợp lệ, người dùng nói rõ, không có giờ → CHẠY NGAY (sau commit). */
export interface RunNowStep {
  index: number;
  deviceId: number;
  command: string;
}

/** Bước đã hợp lệ, người dùng nói rõ, có giờ → TỰ HẸN GIỜ. */
export interface AutoStep {
  index: number;
  deviceId: number;
  command: string;
  runAt: Date;
}

export interface EvaluatedSteps {
  runNow: RunNowStep[];
  autoSchedule: AutoStep[];
  pending: PendingStep[];
  rejected: RejectedStep[];
}

/**
 * Phân loại từng bước theo luật §2.4 (giữ `index` = vị trí trong mảng). `utterance` chỉ dùng để so evidence trong bộ nhớ.
 * `timezone` = múi giờ của nhà (smart_homes.timezone) để đổi "20:00" thành run_at tuyệt đối.
 * `homeDevices` = thiết bị hẹn giờ được mà người dùng XEM được (nạp MỘT lần ở handler) — để kiểm "đúng một thiết bị" (C5).
 */
export async function evaluateSteps(
  auth: AuthContext,
  homeId: number,
  timezone: string,
  utterance: string,
  steps: readonly AgentStepInput[],
  homeDevices: readonly ExplicitStepDevice[],
  now: Date
): Promise<EvaluatedSteps> {
  const result: EvaluatedSteps = { runNow: [], autoSchedule: [], pending: [], rejected: [] };
  const reject = (index: number, code: AgentRejectCode): void => {
    result.rejected.push({ index, code });
  };

  // Khử trùng: LLM hay lặp một bước ("tắt đèn" 2 lần) — bước giống hệt (thiết bị, lệnh, thời điểm) chỉ giữ bước đầu, bước sau bỏ
  // lặng lẽ (không phải lỗi) để khỏi sinh hai lịch/hai lệnh y hệt.
  const seen = new Set<string>();

  for (const [index, step] of steps.entries()) {
    const duplicateKey = `${step.deviceId}|${toCommandAction(step)}|${JSON.stringify(step.when)}`;
    if (seen.has(duplicateKey)) continue;
    seen.add(duplicateKey);

    // 1. Thiết bị + quyền + loại/thao tác hợp lệ
    const check = await checkDeviceControl(auth, homeId, step.deviceId);
    if (!check.ok) {
      reject(index, check.code);
      continue;
    }
    const { device } = check;
    if (!isSchedulableDevice(device) || device.appliance === null || !isActionAllowed(device.appliance, step.action)) {
      reject(index, "NOT_CONTROLLABLE");
      continue;
    }

    // 2. Thời điểm: now → chạy ngay (run_at null); còn lại quy đổi theo múi giờ nhà, ngoài [30 s, 7 ngày] → INVALID_WHEN
    let runAt: Date | null = null;
    if (step.when.kind === "scheduled") {
      try {
        runAt = resolveWhen(step.when.when, timezone, now);
      } catch (err) {
        if (err instanceof HttpError && err.status === 400) {
          reject(index, "INVALID_WHEN");
          continue;
        }
        throw err;
      }
    }

    const command = toCommandAction(step);
    // 3. Nói rõ? (evidence phải gắn với CHÍNH bước này: đúng loại tải, đúng hướng, không phủ định/câu hỏi/điều kiện, đúng một
    //    thiết bị, giờ khớp giờ đã nói — xem explicit-step.ts). Rõ → chạy ngay / tự hẹn giờ; không rõ → chờ xác nhận.
    const self: ExplicitStepDevice = homeDevices.find((candidate) => candidate.id === device.id) ?? {
      id: device.id,
      appliance: device.appliance,
      name: device.device_name,
      roomName: null,
    };
    const explicit = isExplicitStep({
      evidenceSpan: step.evidenceSpan,
      utterance,
      device: self,
      action: step.action,
      temperature: step.temperature,
      position: step.position,
      when: toExplicitWhen(step.when),
      sameApplianceDevices: homeDevices.filter((candidate) => candidate.appliance === device.appliance),
    });
    if (explicit && runAt === null) {
      result.runNow.push({ index, deviceId: device.id, command });
    } else if (explicit && runAt !== null) {
      result.autoSchedule.push({ index, deviceId: device.id, command, runAt });
    } else {
      result.pending.push({
        index,
        device_id: device.id,
        command,
        run_at: runAt ? runAt.toISOString() : null,
        reason: step.reason,
        explicit,
      });
    }
  }
  return result;
}
