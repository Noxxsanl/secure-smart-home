// POST /agent/requests/:requestId/reject — người dùng từ chối đề xuất của Trợ lý (hợp đồng §2.5). Chỉ NGƯỜI TẠO (404 nếu khác).
// pending → rejected bằng UPDATE có điều kiện; không còn pending (đã xác nhận/từ chối/hết hạn) → 409 REQUEST_NOT_PENDING.
import type { AuthContext } from "../../../../core/auth/auth-context";
import type { RequestMeta } from "../../../../core/http/request-meta";
import { HttpError } from "../../../../shared/errors/http-error";
import { logEvent } from "../../../audit";
import { loadOwnRequest } from "../../domain/request-access";
import { markRejected } from "../../infrastructure/agent-request.repository";

export async function rejectAgentRequest(auth: AuthContext, requestId: number, meta: RequestMeta): Promise<{ request_id: number; status: "rejected" }> {
  const { row } = await loadOwnRequest(auth, requestId);
  const notPending = (): HttpError => new HttpError(409, "REQUEST_NOT_PENDING", "Request is no longer pending");
  if (row.status !== "pending") throw notPending();
  if (!(await markRejected(row.id))) throw notPending();

  await logEvent({
    eventType: "AGENT_REQUEST_REJECTED",
    homeId: row.home_id,
    actorUserId: auth.userId,
    message: `${auth.displayName} từ chối đề xuất của Trợ lý AI`,
    ip: meta.ip,
    userAgent: meta.userAgent,
    details: { request_id: row.id, steps: row.pending_steps?.length ?? 0 },
  });
  return { request_id: row.id, status: "rejected" };
}
