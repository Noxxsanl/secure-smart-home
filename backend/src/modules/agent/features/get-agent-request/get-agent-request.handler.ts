// GET /agent/requests/:requestId — chi tiết một yêu cầu của Trợ lý (hợp đồng §2.5), chỉ NGƯỜI TẠO xem được.
// `pending` chỉ có khi còn bước chờ hiển thị được (status hiệu lực pending/expired — expired để client khoá thẻ);
// `schedules` = các lịch yêu cầu đó đã tạo (tự đặt hoặc sau xác nhận).
import type { AuthContext } from "../../../../core/auth/auth-context";
import { listSchedulesByAgentRequest } from "../../../schedules";
import type { Schedule } from "../../../schedules";
import type { AgentInputKind, AgentRequestStatus, PendingView } from "../../domain/agent.types";
import { buildPendingView } from "../../domain/pending-view";
import { effectiveStatus, loadOwnRequest } from "../../domain/request-access";

export interface AgentRequestDetail {
  id: number;
  status: AgentRequestStatus;
  summary: string;
  input_kind: AgentInputKind;
  created_at: string;
  expires_at: string | null;
  pending: PendingView | null;
  schedules: Schedule[];
}

export async function getAgentRequestDetail(auth: AuthContext, requestId: number): Promise<AgentRequestDetail> {
  const { row, access } = await loadOwnRequest(auth, requestId);
  const status = effectiveStatus(row);
  const showPending = (status === "pending" || status === "expired") && row.pending_steps !== null;
  const [pending, schedules] = await Promise.all([
    showPending ? buildPendingView(row, row.pending_steps ?? []) : Promise.resolve(null),
    listSchedulesByAgentRequest(row.id, auth.userId, access.role === "OWNER"),
  ]);
  return {
    id: row.id,
    status,
    summary: row.summary,
    input_kind: row.input_kind,
    created_at: row.created_at.toISOString(),
    expires_at: row.expires_at ? row.expires_at.toISOString() : null,
    pending,
    schedules,
  };
}
