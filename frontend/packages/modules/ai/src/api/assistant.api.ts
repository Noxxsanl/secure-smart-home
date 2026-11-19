import { api } from "@shh/api-client";
import { PORTAL_API } from "@shh/api-client/portal";
import type { AgentConfirmResult, AgentReply, AgentRejectResult, Schedule } from "@shh/api-client/portal";

// Trợ lý AI. Giọng nói/chữ đi tới AI Agent (`/api/agent/**` — Next rewrites / nginx → dịch vụ `agent`, cookie `sh_user`
// đi kèm, `api()` tự gắn `X-Portal: user`); xác nhận/từ chối/huỷ đi tới backend (`/api/portal/**`).
const AGENT_API = "/api/agent";

type Conversation = string | null;

/** POST /api/agent/homes/:homeId/voice — body là audio thô. Agent trả `AgentReply` kèm `transcript`. */
export function sendVoice(homeId: number, audio: Blob, mimeType: string, durationMs: number, conversationId: Conversation) {
  return api<AgentReply>(`${AGENT_API}/homes/${homeId}/voice`, {
    method: "POST",
    rawBody: audio,
    headers: { "Content-Type": mimeType, "X-Audio-Duration-Ms": String(Math.round(durationMs)) },
    query: { conversation_id: conversationId },
  });
}

/** POST /api/agent/homes/:homeId/messages — câu người dùng gõ (1..500 ký tự). */
export function sendMessage(homeId: number, text: string, conversationId: Conversation) {
  return api<AgentReply>(`${AGENT_API}/homes/${homeId}/messages`, {
    method: "POST",
    body: conversationId ? { text, conversation_id: conversationId } : { text },
  });
}

/** POST /api/portal/agent/requests/:id/confirm — `request_hash` nguyên văn từ thẻ "Cần xác nhận". */
export function confirmAgentRequest(requestId: number, requestHash: string, stepIndexes: number[]) {
  return api<AgentConfirmResult>(`${PORTAL_API}/agent/requests/${requestId}/confirm`, {
    method: "POST",
    body: { request_hash: requestHash, step_indexes: stepIndexes },
  });
}

/** POST /api/portal/agent/requests/:id/reject. */
export function rejectAgentRequest(requestId: number) {
  return api<AgentRejectResult>(`${PORTAL_API}/agent/requests/${requestId}/reject`, { method: "POST" });
}

/** POST /api/portal/schedules/:id/cancel — chỉ khi `status = scheduled`; người tạo hoặc chủ nhà. */
export function cancelAssistantSchedule(scheduleId: number) {
  return api<Schedule>(`${PORTAL_API}/schedules/${scheduleId}/cancel`, { method: "POST" });
}
