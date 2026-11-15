// Quyền xem/xử lý một agent_request (hợp đồng §2.5): CHỈ NGƯỜI TẠO, và người đó còn là thành viên của nhà. Mọi lý do "không
// thấy" (không tồn tại, người khác tạo, đã rời nhà) cùng trả 404 "Request not found" — không lộ request có tồn tại hay không.
import type { AuthContext } from "../../../core/auth/auth-context";
import { HttpError, notFound } from "../../../shared/errors/http-error";
import { requireHomeMember } from "../../homes";
import type { HomeAccess } from "../../homes";
import { getAgentRequest } from "../infrastructure/agent-request.repository";
import type { AgentRequestRow, AgentRequestStatus } from "./agent.types";

function requestNotFound(): HttpError {
  return notFound("Request not found");
}

export async function loadOwnRequest(auth: AuthContext, requestId: number): Promise<{ row: AgentRequestRow; access: HomeAccess }> {
  const row = await getAgentRequest(requestId);
  if (!row || row.user_id !== auth.userId) throw requestNotFound();
  const access = await requireHomeMember(auth, row.home_id, "view").catch((err: unknown) => {
    throw err instanceof HttpError && err.status === 404 ? requestNotFound() : err;
  });
  return { row, access };
}

/** Trạng thái hiệu lực: 'pending' mà quá hạn → 'expired' (không cần chờ ai ghi DB). */
export function effectiveStatus(row: Pick<AgentRequestRow, "status" | "expires_at">, now: Date = new Date()): AgentRequestStatus {
  return row.status === "pending" && row.expires_at !== null && row.expires_at.getTime() <= now.getTime() ? "expired" : row.status;
}
