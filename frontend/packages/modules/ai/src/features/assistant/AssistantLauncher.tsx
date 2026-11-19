"use client";

import { useState } from "react";
import { Mic } from "lucide-react";
import { useCurrentHome } from "@shh/auth";
import { useAssistantChat } from "../../api/useAssistantChat";
import { markNoticeSeen, readNoticeSeen } from "../../model/assistant";
import AssistantPanel from "./AssistantPanel";

type AssistantShellProps = { homeId: number; timezone: string };

// Giữ hội thoại ở đây (không ở panel) để đóng/mở panel không mất bong bóng và thẻ "Cần xác nhận" đang chờ.
function AssistantShell({ homeId, timezone }: AssistantShellProps) {
  const chat = useAssistantChat(homeId);
  const [open, setOpen] = useState(false);
  const [showNotice, setShowNotice] = useState(false);

  function openPanel() {
    // Thông báo gửi giọng nói tới OpenAI chỉ hiện ở lần mở đầu tiên trên trình duyệt này.
    setShowNotice(!readNoticeSeen());
    markNoticeSeen();
    setOpen(true);
  }

  return (
    <>
      <button
        type="button"
        onClick={openPanel}
        aria-label="Mở Trợ lý AI"
        title="Trợ lý AI (giọng nói hoặc chữ)"
        className="relative inline-flex h-10 w-10 items-center justify-center rounded border border-gray-200 bg-white text-gray-500 transition hover:bg-gray-50 hover:text-gray-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-200"
      >
        <Mic size={18} />
        {chat.busy && <span className="absolute -right-1 -top-1 h-2.5 w-2.5 animate-pulse rounded-full bg-brand" />}
      </button>
      {open && (
        <AssistantPanel
          chat={chat}
          timezone={timezone}
          showNotice={showNotice}
          onDismissNotice={() => setShowNotice(false)}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

/**
 * Nút micro ở header cổng khách — mở Trợ lý AI cho nhà đang chọn. Không hiện khi chưa có nhà.
 * Đổi nhà thì hội thoại mới (key theo id nhà), vì agent gắn hội thoại với một nhà.
 */
export default function AssistantLauncher() {
  const { current } = useCurrentHome();
  if (!current) return null;
  return <AssistantShell key={current.home.id} homeId={current.home.id} timezone={current.home.timezone} />;
}
