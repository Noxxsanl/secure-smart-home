export type TimelineItem = {
  id: number | string;
  timestamp: string;
  label: string;
  description?: string;
};

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString("vi-VN", {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

export default function Timeline({ items }: { items: TimelineItem[] }) {
  if (items.length === 0) {
    return <p className="py-6 text-center text-sm text-gray-400 dark:text-slate-500">Chưa có sự kiện nào.</p>;
  }
  return (
    <ol className="space-y-0">
      {items.map((item, idx) => (
        <li key={item.id} className="relative flex gap-3 pb-5 last:pb-0">
          <div className="flex flex-col items-center">
            <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-brand ring-4 ring-brand-soft" />
            {idx < items.length - 1 && <span className="w-px flex-1 bg-gray-200 dark:bg-slate-700" />}
          </div>
          <div className="min-w-0 flex-1 pt-0">
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold text-gray-900 dark:text-slate-100">{item.label}</p>
              <span className="font-mono text-[11px] text-gray-400 dark:text-slate-500">{formatTimestamp(item.timestamp)}</span>
            </div>
            {item.description && (
              <p className="mt-0.5 text-xs text-gray-500 dark:text-slate-400">{item.description}</p>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}
