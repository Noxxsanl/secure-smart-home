import { Loader2, Mic, Square } from "lucide-react";
import type { RecorderPhase } from "../model/assistant";

type MicButtonProps = {
  phase: RecorderPhase;
  /** Đang chờ Trợ lý trả lời — khoá nút. */
  busy: boolean;
  onClick: () => void;
};

// Nút ghi âm lớn: bấm để nói, bấm lần nữa để dừng và gửi. Chỉ hiển thị — xin quyền micro do hook làm khi bấm.
export default function MicButton({ phase, busy, onClick }: MicButtonProps) {
  const recording = phase === "recording";
  const waiting = phase === "starting" || busy;
  const label = recording ? "Dừng ghi âm và gửi" : "Bấm để nói";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={waiting}
      aria-label={label}
      aria-pressed={recording}
      title={label}
      className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-white shadow transition focus:outline-none focus:ring-4 disabled:cursor-not-allowed disabled:opacity-60 ${
        recording ? "animate-pulse bg-critical focus:ring-critical/25" : "bg-brand hover:brightness-90 focus:ring-brand/25"
      }`}
    >
      {waiting ? <Loader2 className="h-6 w-6 animate-spin" /> : recording ? <Square className="h-5 w-5 fill-current" /> : <Mic className="h-6 w-6" />}
    </button>
  );
}
