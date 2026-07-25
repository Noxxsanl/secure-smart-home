import { AlertCircle, AlertTriangle, Info, CheckCircle2 } from "lucide-react";
import type { LogSeverity } from "@/shared/mock/types";

const SEVERITY_CONFIG: Record<LogSeverity, { label: string; className: string; icon: React.ElementType }> = {
  critical: { label: "Critical", className: "bg-critical-soft text-critical ring-1 ring-critical/30", icon: AlertCircle },
  warning:  { label: "Warning",  className: "bg-warning-soft text-warning ring-1 ring-warning/30",   icon: AlertTriangle },
  info:     { label: "Info",     className: "bg-gray-100 dark:bg-slate-700 text-info ring-1 ring-gray-200 dark:ring-slate-600", icon: Info },
  success:  { label: "Success",  className: "bg-success-soft text-success ring-1 ring-success/30",   icon: CheckCircle2 },
};

type SeverityBadgeProps = {
  severity: LogSeverity;
  showIcon?: boolean;
};

export default function SeverityBadge({ severity, showIcon = true }: SeverityBadgeProps) {
  const config = SEVERITY_CONFIG[severity];
  const Icon = config.icon;
  return (
    <span className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-semibold ${config.className}`}>
      {showIcon && <Icon size={11} />}
      {config.label}
    </span>
  );
}
