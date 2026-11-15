import { Info } from "lucide-react";

// Các bước Trợ lý không thực hiện được, mỗi bước một câu giải thích tiếng Việt.
export default function RejectedList({ messages }: { messages: string[] }) {
  if (messages.length === 0) return null;
  return (
    <ul className="ml-8 space-y-1 rounded-md border border-warning/30 bg-warning-soft px-3 py-2 text-xs text-warning">
      {messages.map((message, i) => (
        <li key={i} className="flex items-start gap-1.5">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span className="wrap-break-word">{message}</span>
        </li>
      ))}
    </ul>
  );
}
