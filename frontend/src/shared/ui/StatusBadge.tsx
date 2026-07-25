export type StatusKind =
  | "online" | "offline" | "active" | "inactive" | "blocked"
  | "unclaimed" | "suspended" | "connected" | "disconnected"
  | "provisioned" | "pending" | "in_progress" | "completed" | "rolled_back";

const STATUS_CONFIG: Record<StatusKind, { label: string; className: string }> = {
  online:        { label: "Online",        className: "bg-success-soft text-success ring-1 ring-success/30" },
  connected:     { label: "Connected",     className: "bg-success-soft text-success ring-1 ring-success/30" },
  active:        { label: "Active",        className: "bg-success-soft text-success ring-1 ring-success/30" },
  provisioned:   { label: "Provisioned",   className: "bg-success-soft text-success ring-1 ring-success/30" },
  completed:     { label: "Completed",     className: "bg-success-soft text-success ring-1 ring-success/30" },
  offline:       { label: "Offline",       className: "bg-gray-100 dark:bg-slate-700 text-gray-500 dark:text-slate-400 ring-1 ring-gray-200 dark:ring-slate-600" },
  disconnected:  { label: "Disconnected",  className: "bg-gray-100 dark:bg-slate-700 text-gray-500 dark:text-slate-400 ring-1 ring-gray-200 dark:ring-slate-600" },
  inactive:      { label: "Inactive",      className: "bg-gray-100 dark:bg-slate-700 text-gray-500 dark:text-slate-400 ring-1 ring-gray-200 dark:ring-slate-600" },
  pending:       { label: "Pending",       className: "bg-warning-soft text-warning ring-1 ring-warning/30" },
  unclaimed:     { label: "Unclaimed",     className: "bg-warning-soft text-warning ring-1 ring-warning/30" },
  in_progress:   { label: "In progress",   className: "bg-warning-soft text-warning ring-1 ring-warning/30" },
  blocked:       { label: "Blocked",       className: "bg-critical-soft text-critical ring-1 ring-critical/30" },
  suspended:     { label: "Suspended",     className: "bg-critical-soft text-critical ring-1 ring-critical/30" },
  rolled_back:   { label: "Rolled back",   className: "bg-critical-soft text-critical ring-1 ring-critical/30" },
};

type StatusBadgeProps = {
  status: string;
  label?: string;
};

export default function StatusBadge({ status, label }: StatusBadgeProps) {
  const config = STATUS_CONFIG[status as StatusKind] ?? {
    label: status,
    className: "bg-gray-100 dark:bg-slate-700 text-gray-500 dark:text-slate-400 ring-1 ring-gray-200 dark:ring-slate-600",
  };
  return (
    <span className={`inline-flex rounded px-2 py-0.5 text-[11px] font-semibold capitalize ${config.className}`}>
      {label ?? config.label}
    </span>
  );
}
