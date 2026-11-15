"use client";

import { useEffect, useRef, useState } from "react";
import { Info, Loader2, RotateCcw, Send, Sparkles, X } from "lucide-react";
import { useToast } from "@shh/ui";
import type { Schedule } from "@shh/api-client/portal";
import { useNow } from "@shh/utils";
import type { AssistantChat } from "../../api/useAssistantChat";
import { useVoiceRecorder } from "../../api/useVoiceRecorder";
import {
  EXAMPLE_PROMPTS, MAX_RECORD_SECONDS, OPENAI_NOTICE, TEXT_MAX_LENGTH, rejectedMessage,
} from "../../model/assistant";
import ChatBubble from "../../ui/ChatBubble";
import ClarifyChips from "../../ui/ClarifyChips";
import ExecutedList from "../../ui/ExecutedList";
import MicButton from "../../ui/MicButton";
import PendingCard from "../../ui/PendingCard";
import RejectedList from "../../ui/RejectedList";
import ScheduledList from "../../ui/ScheduledList";

type AssistantPanelProps = {
  chat: AssistantChat;
  /** Múi giờ IANA của nhà đang chọn (giờ của bước chờ xác nhận không kèm múi giờ). */
  timezone: string;
  showNotice: boolean;
  onDismissNotice: () => void;
  onClose: () => void;
};

const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

// Ngăn kéo Trợ lý AI: nói hoặc gõ yêu cầu; Trợ lý trả lời, hỏi lại, báo đã làm ngay (lệnh rõ), đã hẹn giờ (huỷ được)
// hoặc xin xác nhận (lệnh chưa rõ). Micro chỉ được xin quyền khi bấm nút ghi âm. Mọi quyết định thật (quyền, lệnh có
// đủ rõ để làm ngay hay không) nằm ở backend.
export default function AssistantPanel({ chat, timezone, showNotice, onDismissNotice, onClose }: AssistantPanelProps) {
  const { showToast } = useToast();
  const recorder = useVoiceRecorder();
  const nowMs = useNow(1000);
  const [text, setText] = useState("");
  const bodyRef = useRef<HTMLDivElement>(null);

  const { entries, busy } = chat;
  const recording = recorder.phase === "recording";

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Cuộn xuống tin mới nhất.
  useEffect(() => {
    const el = bodyRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight });
  }, [entries, busy]);

  function toggleRecording() {
    if (recording) {
      recorder.stop();
    } else {
      void recorder.start((audio) => void chat.sendAudio(audio));
    }
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const value = text.trim();
    if (!value || busy || recording) return;
    setText("");
    void chat.sendText(value);
  }

  async function cancelSchedule(schedule: Schedule) {
    const error = await chat.cancelSchedule(schedule.id);
    showToast(error ?? "Đã huỷ hẹn giờ.", error === null);
  }

  const lastEntry = entries[entries.length - 1];
  const caption = recorder.phase === "starting"
    ? "Đang chờ bạn cho phép micro…"
    : recording
      ? `Đang nghe… ${clock(recorder.seconds)} / ${clock(MAX_RECORD_SECONDS)} — bấm để dừng và gửi`
      : busy
        ? "Đang xử lý…"
        : "Bấm micro để nói, hoặc gõ chữ bên dưới";

  return (
    <div className="fixed inset-0 z-1000" role="presentation">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Trợ lý AI"
        className="absolute inset-y-0 right-0 flex w-full flex-col border-l border-[#E5EAF0] bg-white text-gray-900 shadow-xl sm:w-105 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
      >
        <header className="flex items-center gap-2 border-b border-gray-100 bg-[#F4F5F7] px-4 py-3 dark:border-slate-700 dark:bg-slate-900">
          <Sparkles className="h-4 w-4 text-brand" />
          <h2 className="flex-1 text-sm font-semibold">Trợ lý AI</h2>
          <button
            type="button"
            onClick={chat.reset}
            disabled={busy || entries.length === 0}
            aria-label="Bắt đầu cuộc trò chuyện mới"
            title="Cuộc trò chuyện mới"
            className="rounded p-1.5 text-gray-500 transition hover:bg-gray-200 disabled:opacity-40 dark:text-slate-400 dark:hover:bg-slate-700"
          >
            <RotateCcw className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng Trợ lý AI"
            className="rounded p-1.5 text-gray-500 transition hover:bg-gray-200 dark:text-slate-400 dark:hover:bg-slate-700"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div ref={bodyRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
          {showNotice && (
            <div className="flex items-start gap-2 rounded-md border border-info/30 bg-info-soft px-3 py-2 text-xs text-info" role="note">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span className="flex-1">{OPENAI_NOTICE}</span>
              <button type="button" onClick={onDismissNotice} aria-label="Ẩn thông báo" className="shrink-0 font-semibold hover:underline">
                Đã hiểu
              </button>
            </div>
          )}

          {entries.length === 0 && (
            <div className="space-y-3 pt-2">
              <ChatBubble role="assistant">
                Chào bạn, mình là Trợ lý của ngôi nhà. Bạn có thể nói hoặc gõ, ví dụ:
              </ChatBubble>
              <ClarifyChips options={[...EXAMPLE_PROMPTS]} disabled={busy} onPick={(option) => void chat.sendText(option)} />
              <p className="pl-8 text-xs text-gray-500 dark:text-slate-400">
                Lệnh nói/gõ rõ ràng (bật/tắt thiết bị nào, mấy giờ) mình làm luôn và báo lại; lệnh chưa rõ mình sẽ hỏi lại hoặc xin bạn xác nhận.
              </p>
            </div>
          )}

          {entries.map((entry) => {
            if (entry.role === "user") {
              return (
                <ChatBubble key={entry.id} role="user" voice={entry.voice}>
                  {entry.text ?? "Đang nhận dạng giọng nói…"}
                </ChatBubble>
              );
            }
            if (entry.role === "error") {
              return <ChatBubble key={entry.id} role="error">{entry.text}</ChatBubble>;
            }
            const { reply } = entry;
            const question = reply.clarification?.question;
            const message = reply.reply || question || "";
            return (
              <div key={entry.id} className="space-y-2">
                <ChatBubble role="assistant">
                  {message}
                  {question && message && !message.includes(question) ? `\n${question}` : ""}
                </ChatBubble>
                <ExecutedList executed={reply.executed} timezone={timezone} nowMs={nowMs} />
                <ScheduledList
                  schedules={entry.scheduled}
                  timezone={timezone}
                  nowMs={nowMs}
                  cancellingId={chat.cancellingId}
                  onCancel={(s) => void cancelSchedule(s)}
                  onNavigate={onClose}
                />
                {reply.pending && entry.outcome && (
                  <PendingCard
                    pending={reply.pending}
                    outcome={entry.outcome}
                    timezone={timezone}
                    nowMs={nowMs}
                    onConfirm={(indexes) => void chat.confirm(entry.id, indexes)}
                    onReject={() => void chat.reject(entry.id)}
                  />
                )}
                <RejectedList messages={reply.rejected.map(rejectedMessage)} />
                {entry === lastEntry && reply.clarification && reply.clarification.options.length > 0 && (
                  <ClarifyChips
                    options={reply.clarification.options}
                    disabled={busy || recording}
                    onPick={(option) => void chat.sendText(option)}
                  />
                )}
              </div>
            );
          })}

          {busy && (
            <div className="flex items-center gap-2 pl-8 text-xs text-gray-500 dark:text-slate-400" role="status">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Đang xử lý…
            </div>
          )}
        </div>

        <footer className="space-y-3 border-t border-gray-100 px-4 py-3 dark:border-slate-700">
          {recorder.error && (
            <p className="rounded-md border border-critical/20 bg-critical-soft px-3 py-2 text-xs text-critical" role="alert">
              {recorder.error}
            </p>
          )}
          <div className="flex items-center gap-3">
            <MicButton phase={recorder.phase} busy={busy} onClick={toggleRecording} />
            <p className="text-xs text-gray-500 dark:text-slate-400" aria-live="polite">{caption}</p>
          </div>
          <form onSubmit={submit} className="flex items-center gap-2">
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={TEXT_MAX_LENGTH}
              disabled={busy || recording}
              placeholder="Gõ yêu cầu, ví dụ: 8h tối bật đèn"
              aria-label="Nhập yêu cầu cho Trợ lý"
              className="h-9 min-w-0 flex-1 rounded border border-gray-200 bg-white px-3 text-sm text-gray-900 outline-none placeholder:text-gray-300 focus:border-brand focus:ring-2 focus:ring-brand/15 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 dark:placeholder:text-slate-500"
            />
            <button
              type="submit"
              disabled={busy || recording || text.trim() === ""}
              aria-label="Gửi"
              className="inline-flex h-9 w-9 items-center justify-center rounded bg-brand text-white transition hover:brightness-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Send className="h-4 w-4" />
            </button>
          </form>
        </footer>
      </aside>
    </div>
  );
}
