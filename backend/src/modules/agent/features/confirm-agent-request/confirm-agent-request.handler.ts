// Xác nhận các bước Trợ lý đề xuất (hợp đồng §2.5). Thứ tự:
//   404 (không phải người tạo / không tồn tại) → 409 REQUEST_NOT_PENDING → 409 REQUEST_EXPIRED (kèm đánh dấu expired) →
//   409 REQUEST_CHANGED (hash lệch) → 400 INVALID_INPUT (step_indexes không thuộc các bước chờ).
// Transaction 1 (bất biến 9): pending → confirmed (UPDATE có điều kiện chống xác nhận 2 lần) + tạo scheduled_actions của từng
// bước đã chọn. Bước mất quyền/thiết bị bị xoá/nhà tạm ngưng/hết trần KHÔNG làm hỏng cả request: ghi thành lịch `failed` với
// error_code tương ứng để client hiện kết quả từng bước. SAU commit mới chạy lệnh "ngay" qua executeSchedulesNow (cùng hàm với
// worker → sendDeviceCommand source ai_agent) — KHÔNG giữ transaction trong lúc chờ ack thiết bị; lịch tương lai để worker chạy.
import type { AuthContext } from "../../../../core/auth/auth-context";
import type { RequestMeta } from "../../../../core/http/request-meta";
import { withTransaction } from "../../../../infrastructure/database/db";
import { HttpError } from "../../../../shared/errors/http-error";
import type { CustomerChannel } from "../../../../shared/types/domain";
import { logEvent } from "../../../audit";
import { getDeviceRow } from "../../../devices";
import { MAX_SCHEDULED_PER_HOME, executeSchedulesNow, getSchedulesByIds, insertAgentSchedules } from "../../../schedules";
import type { NewAgentSchedule, Schedule } from "../../../schedules";
import type { ConfirmedStep, PendingStep } from "../../domain/agent.types";
import { hashesEqual } from "../../domain/request-hash";
import { loadOwnRequest } from "../../domain/request-access";
import { checkDeviceControl } from "../../domain/step-rules";
import { markCompleted, markConfirmed, markExpired } from "../../infrastructure/agent-request.repository";
import type { ConfirmAgentRequestInput } from "./confirm-agent-request.dto";

/** Lịch có run_at còn xa hơn ngưỡng này mới để worker chạy; gần hơn (hoặc đã qua) → chạy ngay. */
const RUN_NOW_WINDOW_MS = 5_000;

export interface ConfirmResult {
  request_id: number;
  status: "completed";
  results: Schedule[];
}

interface PlannedStep {
  step: PendingStep;
  item: NewAgentSchedule;
  /** true = lịch hợp lệ chạy ngay sau commit. */
  runNow: boolean;
}

function notPending(): HttpError {
  return new HttpError(409, "REQUEST_NOT_PENDING", "Request is no longer pending");
}

/** Kiểm lại quyền từng bước (người dùng có thể đã mất quyền / thiết bị bị xoá trong 5 phút chờ) → lịch hợp lệ hoặc lịch failed. */
async function planStep(auth: AuthContext, homeId: number, step: PendingStep, now: Date): Promise<PlannedStep> {
  const check = await checkDeviceControl(auth, homeId, step.device_id);
  if (check.ok) {
    const planned = step.run_at !== null ? new Date(step.run_at) : null;
    const future = planned !== null && planned.getTime() > now.getTime() + RUN_NOW_WINDOW_MS;
    // Lịch "chạy ngay" chèn thẳng 'running' (startRunning): worker 5 s không thể giành trước giữa commit và executeScheduleNow
    return {
      step,
      item: { deviceId: step.device_id, action: step.command, runAt: future ? planned : now, startRunning: !future },
      runNow: !future,
    };
  }
  if (check.code === "HOME_SUSPENDED") {
    return { step, item: { deviceId: step.device_id, action: step.command, runAt: now, failedCode: "HOME_SUSPENDED" }, runNow: false };
  }
  // 404/403: thiết bị đã xoá (không còn dòng) hay người dùng mất quyền?
  const existing = await getDeviceRow(step.device_id);
  const gone = existing === null || existing.home_id !== homeId;
  return {
    step,
    item: { deviceId: gone ? null : step.device_id, action: step.command, runAt: now, failedCode: gone ? "NO_DEVICE" : "ACCESS_REVOKED" },
    runNow: false,
  };
}

export async function confirmAgentRequest(
  auth: AuthContext,
  requestId: number,
  input: ConfirmAgentRequestInput,
  channel: CustomerChannel,
  meta: RequestMeta
): Promise<ConfirmResult> {
  const { row, access } = await loadOwnRequest(auth, requestId);
  const now = new Date();
  if (row.status !== "pending") throw notPending();
  if (row.expires_at !== null && row.expires_at.getTime() <= now.getTime()) {
    await markExpired(row.id);
    throw new HttpError(409, "REQUEST_EXPIRED", "Request has expired");
  }
  if (row.request_hash === null || !hashesEqual(input.requestHash, row.request_hash)) {
    throw new HttpError(409, "REQUEST_CHANGED", "Request content has changed");
  }
  const pendingSteps = row.pending_steps ?? [];
  const selected: PendingStep[] = [];
  for (const index of [...input.stepIndexes].sort((a, b) => a - b)) {
    const step = pendingSteps.find((candidate) => candidate.index === index);
    if (!step) throw new HttpError(400, "INVALID_INPUT", "step_indexes must be distinct integers of pending steps");
    selected.push(step);
  }

  const planned: PlannedStep[] = [];
  for (const step of selected) planned.push(await planStep(auth, row.home_id, step, now));

  const confirmedSteps: ConfirmedStep[] = selected.map((step) => ({
    index: step.index,
    device_id: step.device_id,
    command: step.command,
    run_at: step.run_at,
  }));
  const ctx = { homeId: row.home_id, agentRequestId: row.id, channel, createdByUserId: auth.userId };

  const scheduleIds = await withTransaction(async (conn) => {
    if (!(await markConfirmed(row.id, confirmedSteps, conn))) throw notPending();
    const ids = await insertAgentSchedules(
      conn,
      ctx,
      planned.map((entry) => entry.item),
      MAX_SCHEDULED_PER_HOME
    );
    // Hết trần 50 lịch: bước đó cũng được ghi lại thành lịch failed (UNKNOWN — mã SCHEDULE_LIMIT không thuộc 11 mã của DTO)
    const overLimit = planned.flatMap((entry, i) => (ids[i] === null ? [{ i, entry }] : []));
    if (overLimit.length > 0) {
      const failedIds = await insertAgentSchedules(
        conn,
        ctx,
        overLimit.map(({ entry }) => ({ ...entry.item, failedCode: "UNKNOWN" })),
        MAX_SCHEDULED_PER_HOME
      );
      overLimit.forEach(({ i, entry }, k) => {
        ids[i] = failedIds[k];
        entry.runNow = false;
      });
    }
    return ids as number[];
  });

  // Sau commit: lệnh chạy ngay đi qua cùng đường với worker (không giữ transaction trong lúc chờ ack thiết bị)
  await executeSchedulesNow(planned.flatMap((entry, i) => (entry.runNow ? [{ id: scheduleIds[i], deviceId: entry.step.device_id }] : [])));
  await markCompleted(row.id);

  const order = new Map(scheduleIds.map((id, i) => [id, i]));
  const results = (await getSchedulesByIds(scheduleIds, auth.userId, access.role === "OWNER")).sort(
    (a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0)
  );

  await logEvent({
    eventType: "AGENT_REQUEST_CONFIRMED",
    homeId: row.home_id,
    actorUserId: auth.userId,
    message: `${auth.displayName} xác nhận ${selected.length} bước của Trợ lý AI`,
    ip: meta.ip,
    userAgent: meta.userAgent,
    details: {
      request_id: row.id,
      selected: selected.length,
      failed: results.filter((item) => item.status === "failed").length,
    },
  });

  return { request_id: row.id, status: "completed", results };
}
