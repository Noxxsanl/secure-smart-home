import { AlertCircle, Sparkles } from "lucide-react";

type ChatBubbleProps = {
  role: "user" | "assistant" | "error";
  /** Bong bóng của người dùng nói bằng giọng: hiện "Bạn nói: …". */
  voice?: boolean;
  children: React.ReactNode;
};

// Bong bóng hội thoại: người dùng bên phải, Trợ lý bên trái, lỗi dạng khung cảnh báo. Chỉ hiển thị.
export default function ChatBubble({ role, voice = false, children }: ChatBubbleProps) {
  if (role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-lg rounded-br-sm bg-brand px-3 py-2 text-sm text-white">
          {voice && <span className="mr-1 font-semibold opacity-80">Bạn nói:</span>}
          <span className="whitespace-pre-line wrap-break-word">{children}</span>
        </div>
      </div>
    );
  }
  if (role === "error") {
    return (
      <div className="flex items-start gap-2 rounded-md border border-critical/20 bg-critical-soft px-3 py-2 text-sm text-critical" role="alert">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
        <span className="wrap-break-word">{children}</span>
      </div>
    );
  }
  return (
    <div className="flex items-start gap-2">
      <span className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand">
        <Sparkles className="h-3.5 w-3.5" />
      </span>
      <div className="min-w-0 max-w-[85%] rounded-lg rounded-tl-sm bg-gray-100 px-3 py-2 text-sm text-gray-900 dark:bg-slate-700 dark:text-slate-100">
        <span className="whitespace-pre-line wrap-break-word">{children}</span>
      </div>
    </div>
  );
}
