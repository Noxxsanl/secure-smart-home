// Tạo yêu cầu của Trợ lý AI (hợp đồng §2.3–2.4). Thứ tự: thành viên nhà (404) → nạp thiết bị nhà MỘT lần → phân loại từng bước
// theo luật tất định (domain/step-rules.ts: chạy ngay / tự hẹn giờ / chờ xác nhận / từ chối) → GHI agent_requests +
// scheduled_actions trong 1 TRANSACTION (bất biến 9; trần 50 lịch dùng advisory lock của module schedules) → SAU commit mới
// chạy các bước "chạy ngay" (không giữ transaction lúc chờ ack thiết bị) → thông báo AGENT_SCHEDULED (chỉ lịch tương lai) +
// audit AGENT_REQUEST_CREATED.
// Câu nói (`utterance`) chỉ dùng trong bộ nhớ để so evidence — không lưu DB, không đưa vào audit/log (bất biến 2).
import type { AuthContext } from "../../../../core/auth/auth-context";
import type { RequestMeta } from "../../../../core/http/request-meta";
import { withTransaction } from "../../../../infrastructure/database/db";
import { logEvent } from "../../../audit";
import { listHomeDeviceRows, toCustomerDevices } from "../../../devices";
import { requireHomeMember } from "../../../homes";
import { notifyUser } from "../../../notifications";
import { MAX_SCHEDULED_PER_HOME, executeSchedulesNow, getSchedulesByIds, insertAgentSchedules, isSchedulableDevice } from "../../../schedules";
import type { Schedule } from "../../../schedules";
import { channelOfAuth } from "../../domain/agent-channel";
import type { AgentRequestStatus, CreateAgentRequestInput, PendingView, RejectedStep } from "../../domain/agent.types";
import type { ExplicitStepDevice } from "../../domain/explicit-step";
import { describeLocalTime } from "../../domain/local-time";
import { buildPendingView } from "../../domain/pending-view";
import { computeRequestHash } from "../../domain/request-hash";
import { PENDING_TTL_MS, evaluateSteps } from "../../domain/step-rules";
import { insertAgentRequest } from "../../infrastructure/agent-request.repository";

export interface CreateAgentRequestResult {
  /** null khi KHÔNG bước nào hợp lệ (không tạo dòng agent_requests). */
  request_id: number | null;
  /** 'pending' khi có bước chờ xác nhận, 'completed' khi mọi bước hợp lệ đã chạy/hẹn; 'rejected' khi không tạo dòng nào. */
  status: AgentRequestStatus;
  /** Bước người dùng nói rõ, không có giờ: ĐÃ chạy (kèm kết quả done/skipped/failed…). Luôn có (mảng rỗng nếu không có). */
  executed: Schedule[];
  /** Bước người dùng nói rõ, có giờ: lịch tương lai (huỷ được tới lúc chạy). */
  scheduled: Schedule[];
  pending: PendingView | null;
  rejected: RejectedStep[];
}

/** Ném trong transaction để ROLLBACK khi trần lịch loại hết bước hẹn giờ mà không còn bước chạy ngay/chờ nào. */
class NoValidStepsError extends Error {
  constructor(readonly rejected: RejectedStep[]) {
    super("no valid steps");
  }
}

/** Thời gian tối đa response chờ các bước "chạy ngay" (xem chỗ gọi). */
const RUN_NOW_WAIT_MS = 6_000;

/** Chờ `work` xong hoặc hết `ms`, cái nào tới trước; `work` không bị huỷ và lỗi của nó không bao giờ làm hỏng response. */
function waitAtMost(work: Promise<void>, ms: number): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    const done = (): void => {
      clearTimeout(timer);
      resolve();
    };
    work.then(done, done);
  });
}

function byIndex(a: RejectedStep, b: RejectedStep): number {
  return a.index - b.index;
}

export async function createAgentRequest(
  auth: AuthContext,
  homeId: number,
  input: CreateAgentRequestInput,
  meta: RequestMeta
): Promise<CreateAgentRequestResult> {
  const access = await requireHomeMember(auth, homeId, "view");
  const timezone = access.home.timezone;
  const now = new Date();

  // Thiết bị hẹn giờ được mà người dùng XEM được (giống `devices` của GET /context), nạp 1 lần cho mọi bước — luật "đúng một
  // thiết bị" cần biết nhà có mấy thiết bị cùng loại và ở phòng nào. toCustomerDevices tự lọc theo quyền xem (GUEST).
  const deviceRows = await listHomeDeviceRows(homeId, { includeGateway: false });
  const homeDevices: ExplicitStepDevice[] = [];
  for (const device of await toCustomerDevices(deviceRows.filter(isSchedulableDevice), access)) {
    if (device.appliance !== null) {
      homeDevices.push({ id: device.id, appliance: device.appliance, name: device.device_name, roomName: device.room_name });
    }
  }

  const { runNow, autoSchedule, pending, rejected } = await evaluateSteps(
    auth,
    homeId,
    timezone,
    input.utterance,
    input.steps,
    homeDevices,
    now
  );
  if (runNow.length === 0 && autoSchedule.length === 0 && pending.length === 0) {
    return { request_id: null, status: "rejected", executed: [], scheduled: [], pending: null, rejected: rejected.sort(byIndex) };
  }

  const hasPending = pending.length > 0;
  const requestHash = hasPending ? computeRequestHash(pending) : null;
  const expiresAt = hasPending ? new Date(now.getTime() + PENDING_TTL_MS) : null;
  const status: AgentRequestStatus = hasPending ? "pending" : "completed";
  const channel = channelOfAuth(auth);

  let created: { requestId: number; executeIds: number[]; scheduledIds: number[]; limitRejected: RejectedStep[] };
  try {
    created = await withTransaction(async (conn) => {
      const requestId = await insertAgentRequest(
        {
          homeId,
          userId: auth.userId,
          channel,
          inputKind: input.inputKind,
          summary: input.summary,
          pendingSteps: hasPending ? pending : null,
          requestHash,
          status,
          expiresAt,
        },
        conn
      );
      // Lịch tương lai (tính trần 50) rồi bước chạy ngay. Bước chạy ngay chèn thẳng 'running' (startRunning): worker 5 s không
      // thể giành trước giữa commit và executeSchedulesNow (nếu không sẽ chạy trùng + thông báo trùng), và không tính trần 50
      // vì chạy luôn chứ không chiếm chỗ chờ — đúng như đường xác nhận.
      const ids = await insertAgentSchedules(
        conn,
        { homeId, agentRequestId: requestId, channel, createdByUserId: auth.userId },
        [
          ...autoSchedule.map((step) => ({ deviceId: step.deviceId, action: step.command, runAt: step.runAt })),
          ...runNow.map((step) => ({ deviceId: step.deviceId, action: step.command, runAt: now, startRunning: true })),
        ],
        MAX_SCHEDULED_PER_HOME
      );
      const scheduledIds: number[] = [];
      const limitRejected: RejectedStep[] = [];
      autoSchedule.forEach((step, i) => {
        const id = ids[i];
        if (id === null) limitRejected.push({ index: step.index, code: "SCHEDULE_LIMIT" });
        else scheduledIds.push(id);
      });
      const executeIds = ids.slice(autoSchedule.length).filter((id): id is number => id !== null);
      if (scheduledIds.length === 0 && executeIds.length === 0 && !hasPending) throw new NoValidStepsError(limitRejected);
      return { requestId, executeIds, scheduledIds, limitRejected };
    });
  } catch (err) {
    if (err instanceof NoValidStepsError) {
      return {
        request_id: null,
        status: "rejected",
        executed: [],
        scheduled: [],
        pending: null,
        rejected: [...rejected, ...err.rejected].sort(byIndex),
      };
    }
    throw err;
  }

  // Sau commit: chạy các bước "chạy ngay" qua đúng đường của worker (sendDeviceCommand source ai_agent). Chờ ack nên KHÔNG
  // nằm trong transaction; thông báo do response thay (notify: false), giống đường xác nhận. Chỉ chờ TỐI ĐA 6 s: dịch vụ agent
  // gọi backend với timeout 10 s, mà nhiều lệnh tuần tự trên cùng một thiết bị × ack 5 s có thể vượt — khi đó web báo lỗi dù lệnh
  // vẫn chạy. Quá 6 s thì trả luôn trạng thái hiện tại (có thể `running`); lệnh vẫn chạy tiếp ở nền và ghi kết quả vào lịch.
  await waitAtMost(executeSchedulesNow(created.executeIds.map((id, i) => ({ id, deviceId: runNow[i].deviceId }))), RUN_NOW_WAIT_MS);

  const allRejected = [...rejected, ...created.limitRejected].sort(byIndex);
  const isOwner = access.role === "OWNER";
  // Giữ thứ tự bước (getSchedulesByIds sắp theo id nhưng id chèn đã theo thứ tự bước; sắp lại cho chắc)
  const orderOf = (ids: readonly number[]): Map<number, number> => new Map(ids.map((id, i) => [id, i]));
  const executedOrder = orderOf(created.executeIds);
  const executed = (await getSchedulesByIds(created.executeIds, auth.userId, isOwner)).sort(
    (a, b) => (executedOrder.get(a.id) ?? 0) - (executedOrder.get(b.id) ?? 0)
  );
  const scheduledOrder = orderOf(created.scheduledIds);
  const scheduled = (await getSchedulesByIds(created.scheduledIds, auth.userId, isOwner)).sort(
    (a, b) => (scheduledOrder.get(a.id) ?? 0) - (scheduledOrder.get(b.id) ?? 0)
  );
  const pendingView = hasPending
    ? await buildPendingView({ id: created.requestId, request_hash: requestHash, expires_at: expiresAt }, pending)
    : null;

  // Chỉ lịch TƯƠNG LAI mới cần thông báo (người dùng sẽ không nhìn màn hình lúc nó chạy); bước chạy ngay đã có kết quả trong response
  if (scheduled.length > 0) {
    const deviceIds = new Set(scheduled.map((item) => item.device_id));
    await notifyUser({
      userId: auth.userId,
      homeId,
      relatedDeviceId: deviceIds.size === 1 ? (scheduled[0].device_id ?? null) : null,
      type: "AGENT_SCHEDULED",
      title: "Trợ lý đã hẹn giờ",
      message: `Đã hẹn: ${scheduled.map((item) => `${describeLocalTime(new Date(item.run_at), now, timezone)} ${item.action_label}`).join(" · ")}`,
      severity: "info",
    });
  }

  // details chỉ có id + số bước theo loại + mã bị từ chối — KHÔNG có utterance/summary/evidence/lý do của LLM
  await logEvent({
    eventType: "AGENT_REQUEST_CREATED",
    homeId,
    actorUserId: auth.userId,
    message: `Trợ lý AI nhận lệnh của ${auth.displayName}: ${executed.length} bước chạy ngay, ${scheduled.length} bước hẹn giờ, ${pending.length} bước chờ xác nhận`,
    ip: meta.ip,
    userAgent: meta.userAgent,
    details: {
      request_id: created.requestId,
      input_kind: input.inputKind,
      executed: executed.length,
      scheduled: scheduled.length,
      pending: pending.length,
      rejected: allRejected.map((item) => item.code),
    },
  });

  return { request_id: created.requestId, status, executed, scheduled, pending: pendingView, rejected: allRejected };
}
