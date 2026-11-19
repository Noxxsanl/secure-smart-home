type OnlineIndicatorProps = {
  /** Backend tính sẵn: last_seen trong 90 giây gần nhất (NFR-R1). */
  online: boolean;
};

export default function OnlineIndicator({ online }: OnlineIndicatorProps) {
  if (online) {
    return (
      <span className="inline-flex items-center gap-1.5">
        <span className="relative flex h-2.5 w-2.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-60" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-success" />
        </span>
        <span className="text-xs font-medium text-success">Online</span>
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="h-2.5 w-2.5 rounded-full bg-gray-300 dark:bg-slate-600" />
      <span className="text-xs text-gray-400 dark:text-slate-500">Offline</span>
    </span>
  );
}
