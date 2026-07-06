"use client";

type OnlineIndicatorProps = {
  lastSeen: string | null;
};

// Ngưỡng 60 giây phản chiếu điều kiện TIMESTAMPDIFF(SECOND, last_seen, NOW()) < 60
// trong các câu SQL của backend và helper isOnline() trong deviceStatus.ts.
function isOnline(lastSeen: string | null): boolean {
  if (!lastSeen) return false;
  const diff = (Date.now() - new Date(lastSeen).getTime()) / 1000;
  return diff < 60;
}

export default function OnlineIndicator({ lastSeen }: OnlineIndicatorProps) {
  const online = isOnline(lastSeen);

  if (online) {
    return (
      <span className="inline-flex items-center gap-1.5">
        <span className="relative flex h-2.5 w-2.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
        </span>
        <span className="text-xs text-emerald-600">Online</span>
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="h-2.5 w-2.5 rounded-full bg-gray-300" />
      <span className="text-xs text-gray-400">Offline</span>
    </span>
  );
}
