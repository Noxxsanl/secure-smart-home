type DeviceStatusBadgeProps = {
  status: "online" | "offline" | "active" | "inactive" | "blocked";
};

const statusConfig: Record<string, { label: string; className: string }> = {
  online:   { label: "online",   className: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200" },
  active:   { label: "active",   className: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200" },
  offline:  { label: "offline",  className: "bg-gray-100 text-gray-500 ring-1 ring-gray-200" },
  inactive: { label: "inactive", className: "bg-gray-100 text-gray-500 ring-1 ring-gray-200" },
  blocked:  { label: "blocked",  className: "bg-red-50 text-red-700 ring-1 ring-red-200" },
};

export default function DeviceStatusBadge({ status }: DeviceStatusBadgeProps) {
  const config = statusConfig[status] ?? statusConfig.inactive;
  return (
    <span className={`inline-flex rounded px-2 py-0.5 text-[11px] font-semibold ${config.className}`}>
      {config.label}
    </span>
  );
}
