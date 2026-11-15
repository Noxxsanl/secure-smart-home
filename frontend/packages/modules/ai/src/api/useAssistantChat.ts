"use client";

import { useRef, useState } from "react";
import {
  devicesPrefix, notificationsPrefix, overviewKey, roomsPrefix, schedulesPrefix, useRevalidate,
} from "@shh/api-client/portal";
import type { AgentReply, Schedule } from "@shh/api-client/portal";
import {
  AUDIO_MAX_BYTES, MIC_ERRORS, TEXT_MAX_LENGTH, assistantErrorMessage, cancelErrorMessage, confirmErrorMessage,
  isStaleRequestError,
  type ChatEntry, type PendingOutcome, type RecordedAudio,
} from "../model/assistant";
import {
  cancelAssistantSchedule, confirmAgentRequest, rejectAgentRequest, sendMessage, sendVoice,
} from "./assistant.api";

// Agent có thể bỏ trường rỗng — chuẩn hoá để UI không phải kiểm tra undefined khắp nơi.
function normalizeReply(raw: AgentReply): AgentReply {
  return {
    ...raw,
    transcript: raw.transcript ?? null,
    clarification: raw.clarification ?? null,
    executed: raw.executed ?? [],
    scheduled: raw.scheduled ?? [],
    pending: raw.pending ?? null,
    rejected: raw.rejected ?? [],
  };
}

/**
 * Hội thoại với Trợ lý của một nhà: gửi chữ/giọng nói tới agent (giữ `conversation_id`); lệnh rõ backend đã làm
 * ngay (`executed`), xác nhận/từ chối thẻ "Cần xác nhận" cho lệnh chưa rõ, huỷ lịch Trợ lý đã hẹn; sau mỗi thay đổi làm mới SWR (lịch, tổng quan, thiết bị, thông báo).
 * Trạng thái nằm trong bộ nhớ trình duyệt — không lưu câu nói hay âm thanh ở đâu cả.
 */
export function useAssistantChat(homeId: number) {
  const revalidate = useRevalidate();
  const [entries, setEntries] = useState<ChatEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const [cancellingId, setCancellingId] = useState<number | null>(null);
  const conversationId = useRef<string | null>(null);
  const nextId = useRef(1);
  const busyRef = useRef(false);

  const newId = () => nextId.current++;
  const push = (entry: ChatEntry) => setEntries((prev) => [...prev, entry]);
  const patch = (id: number, change: (entry: ChatEntry) => ChatEntry) =>
    setEntries((prev) => prev.map((entry) => (entry.id === id ? change(entry) : entry)));
  const setOutcome = (id: number, outcome: PendingOutcome) =>
    patch(id, (entry) => (entry.role === "assistant" ? { ...entry, outcome } : entry));

  async function ask(call: () => Promise<AgentReply>, userEntryId: number, voice: boolean) {
    busyRef.current = true;
    setBusy(true);
    try {
      const reply = normalizeReply(await call());
      conversationId.current = reply.conversation_id || conversationId.current;
      if (voice) {
        const transcript = reply.transcript?.trim() || null;
        patch(userEntryId, (e) => (e.role === "user" ? { ...e, text: transcript ?? "Tin nhắn giọng nói" } : e));
      }
      push({
        id: newId(), role: "assistant", reply, scheduled: reply.scheduled,
        outcome: reply.pending ? { phase: "open" } : null,
      });
      if (reply.executed.length > 0) {
        // Lệnh rõ đã chạy ngay → trạng thái thiết bị/phòng/tổng quan đổi, làm mới thay vì chờ polling.
        void revalidate(schedulesPrefix(homeId), overviewKey(homeId), devicesPrefix, roomsPrefix, notificationsPrefix);
      } else if (reply.scheduled.length > 0 || reply.pending) {
        // Lịch mới + thông báo "Trợ lý đã hẹn giờ" hiện ngay thay vì chờ chu kỳ polling.
        void revalidate(schedulesPrefix(homeId), notificationsPrefix);
      }
    } catch (err) {
      if (voice) patch(userEntryId, (e) => (e.role === "user" ? { ...e, text: "Tin nhắn giọng nói" } : e));
      push({ id: newId(), role: "error", text: assistantErrorMessage(err, voice) });
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  /** Gửi câu gõ tay (hoặc chip hỏi lại / câu mẫu). */
  async function sendText(raw: string) {
    const text = raw.trim();
    if (!text || busyRef.current) return;
    const id = newId();
    push({ id, role: "user", text: text.slice(0, TEXT_MAX_LENGTH), voice: false });
    await ask(() => sendMessage(homeId, text.slice(0, TEXT_MAX_LENGTH), conversationId.current), id, false);
  }

  /** Gửi bản ghi âm vừa dừng. */
  async function sendAudio(audio: RecordedAudio) {
    if (busyRef.current) return;
    if (audio.blob.size > AUDIO_MAX_BYTES) {
      push({ id: newId(), role: "error", text: MIC_ERRORS.tooLarge });
      return;
    }
    const id = newId();
    push({ id, role: "user", text: null, voice: true });
    await ask(
      () => sendVoice(homeId, audio.blob, audio.mimeType, audio.durationMs, conversationId.current), id, true,
    );
  }

  /** Xác nhận các bước đã chọn của thẻ "Cần xác nhận". */
  async function confirm(entryId: number, stepIndexes: number[]) {
    const entry = entries.find((e) => e.id === entryId);
    if (!entry || entry.role !== "assistant" || !entry.reply.pending || stepIndexes.length === 0) return;
    const { request_id, request_hash } = entry.reply.pending;
    setOutcome(entryId, { phase: "confirming" });
    try {
      const result = await confirmAgentRequest(request_id, request_hash, stepIndexes);
      setOutcome(entryId, { phase: "done", results: result.results });
      void revalidate(schedulesPrefix(homeId), overviewKey(homeId), devicesPrefix, roomsPrefix, notificationsPrefix);
    } catch (err) {
      const message = confirmErrorMessage(err);
      setOutcome(entryId, isStaleRequestError(err) ? { phase: "stale", message } : { phase: "open", error: message });
    }
  }

  /** Huỷ cả yêu cầu đang chờ xác nhận. */
  async function reject(entryId: number) {
    const entry = entries.find((e) => e.id === entryId);
    if (!entry || entry.role !== "assistant" || !entry.reply.pending) return;
    setOutcome(entryId, { phase: "rejecting" });
    try {
      await rejectAgentRequest(entry.reply.pending.request_id);
      setOutcome(entryId, { phase: "rejected" });
    } catch (err) {
      const message = confirmErrorMessage(err);
      setOutcome(entryId, isStaleRequestError(err) ? { phase: "stale", message } : { phase: "open", error: message });
    }
  }

  /** Huỷ một lịch Trợ lý đã hẹn. Trả câu lỗi tiếng Việt nếu thất bại, null nếu thành công. */
  async function cancelSchedule(scheduleId: number): Promise<string | null> {
    setCancellingId(scheduleId);
    try {
      const updated: Schedule = await cancelAssistantSchedule(scheduleId);
      setEntries((prev) =>
        prev.map((e) =>
          e.role === "assistant"
            ? { ...e, scheduled: e.scheduled.map((s) => (s.id === updated.id ? updated : s)) }
            : e,
        ),
      );
      void revalidate(schedulesPrefix(homeId));
      return null;
    } catch (err) {
      // 404/409: lịch vừa chạy hoặc đã bị huỷ — làm mới để danh sách khớp thực tế.
      void revalidate(schedulesPrefix(homeId));
      return cancelErrorMessage(err);
    } finally {
      setCancellingId(null);
    }
  }

  /** Bắt đầu hội thoại mới (quên `conversation_id`, xoá bong bóng). Lịch đã hẹn vẫn còn trong trang Hẹn giờ. */
  function reset() {
    if (busyRef.current) return;
    conversationId.current = null;
    setEntries([]);
  }

  return { entries, busy, cancellingId, sendText, sendAudio, confirm, reject, cancelSchedule, reset };
}

export type AssistantChat = ReturnType<typeof useAssistantChat>;
