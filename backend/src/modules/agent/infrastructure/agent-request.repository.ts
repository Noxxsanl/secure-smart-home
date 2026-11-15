// SQL bảng agent_requests (module agent là chủ duy nhất). Không lưu audio/câu nói/transcript — chỉ summary + các bước.
// Mọi chuyển trạng thái là UPDATE có điều kiện (`WHERE status = …`) rồi kiểm affectedRows để chống race (xác nhận 2 lần,
// vừa xác nhận vừa từ chối).
import pool from "../../../infrastructure/database/pool";
import { queryOne, runSql, type Queryable } from "../../../infrastructure/database/db";
import type { CustomerChannel } from "../../../shared/types/domain";
import type { AgentInputKind, AgentRequestRow, AgentRequestStatus, ConfirmedStep, PendingStep } from "../domain/agent.types";

export interface NewAgentRequest {
  homeId: number;
  userId: number;
  channel: CustomerChannel;
  inputKind: AgentInputKind;
  summary: string;
  pendingSteps: PendingStep[] | null;
  requestHash: string | null;
  /** 'pending' khi có bước chờ xác nhận, ngược lại 'completed' (chỉ có bước chạy ngay/tự hẹn giờ). */
  status: AgentRequestStatus;
  expiresAt: Date | null;
}

export async function insertAgentRequest(input: NewAgentRequest, db: Queryable = pool): Promise<number> {
  const result = await runSql(
    `INSERT INTO agent_requests (home_id, user_id, channel, input_kind, summary, pending_steps, request_hash, status, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
    [
      input.homeId,
      input.userId,
      input.channel,
      input.inputKind,
      input.summary,
      input.pendingSteps === null ? null : JSON.stringify(input.pendingSteps),
      input.requestHash,
      input.status,
      input.expiresAt,
    ],
    db
  );
  return result.insertId;
}

export async function getAgentRequest(id: number, db: Queryable = pool): Promise<AgentRequestRow | null> {
  return queryOne<AgentRequestRow>(
    `SELECT id, home_id, user_id, channel, input_kind, summary, pending_steps, confirmed_steps, request_hash, status,
            expires_at, confirmed_at, created_at
       FROM agent_requests WHERE id = ?`,
    [id],
    db
  );
}

/**
 * pending → confirmed, lưu các bước đã chọn. Điều kiện `status = 'pending' AND expires_at > NOW()`: 0 dòng nghĩa là có
 * đường khác (xác nhận/từ chối/hết hạn) xử lý trước → người gọi trả 409 REQUEST_NOT_PENDING.
 */
export async function markConfirmed(id: number, confirmedSteps: ConfirmedStep[], db: Queryable): Promise<boolean> {
  const result = await runSql(
    `UPDATE agent_requests
        SET status = 'confirmed', confirmed_steps = ?, confirmed_at = NOW(), updated_at = NOW()
      WHERE id = ? AND status = 'pending' AND (expires_at IS NULL OR expires_at > NOW())`,
    [JSON.stringify(confirmedSteps), id],
    db
  );
  return result.affectedRows > 0;
}

export async function markRejected(id: number): Promise<boolean> {
  const result = await runSql("UPDATE agent_requests SET status = 'rejected', updated_at = NOW() WHERE id = ? AND status = 'pending'", [id]);
  return result.affectedRows > 0;
}

export async function markExpired(id: number): Promise<boolean> {
  const result = await runSql("UPDATE agent_requests SET status = 'expired', updated_at = NOW() WHERE id = ? AND status = 'pending'", [id]);
  return result.affectedRows > 0;
}

export async function markCompleted(id: number): Promise<boolean> {
  const result = await runSql("UPDATE agent_requests SET status = 'completed', updated_at = NOW() WHERE id = ? AND status = 'confirmed'", [id]);
  return result.affectedRows > 0;
}
