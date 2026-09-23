import type { LucideIcon } from "lucide-react";
import { Bell, CheckCircle2, Info, AlertTriangle } from "lucide-react";
import AiSectionCard from "@/features/ai/components/AiSectionCard";
import EmptyState from "@/shared/ui/EmptyState";
import Skeleton from "@/shared/ui/Skeleton";
import type { AiNotification, AiNotificationLevel } from "@/shared/mock/ai";

const LEVEL_CONFIG: Record<AiNotificationLevel, { icon: LucideIcon; className: string }> = {
  success: { icon: CheckCircle2,  className: "bg-success-soft text-success" },
  info:    { icon: Info,          className: "bg-brand-soft text-brand" },
  warning: { icon: AlertTriangle, className: "bg-warning-soft text-warning" },
};

type NotificationPanelProps = {
  notifications: AiNotification[];
  isLoading: boolean;
};

export default function NotificationPanel({ notifications, isLoading }: NotificationPanelProps) {
  return (
    <AiSectionCard
      title="AI Notifications"
      subtitle="Sự kiện gần nhất từ pipeline huấn luyện và dự đoán."
      icon={Bell}
      bodyClassName="p-0"
    >
      {isLoading ? (
        <div className="space-y-2 p-4">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-lg" />)}
        </div>
      ) : notifications.length === 0 ? (
        <EmptyState icon={Bell} title="Chưa có thông báo nào" />
      ) : (
        <ul className="max-h-80 divide-y divide-gray-100 dark:divide-slate-700 overflow-y-auto">
          {notifications.map((item) => {
            const level = LEVEL_CONFIG[item.level];
            const Icon = level.icon;
            return (
              <li
                key={item.id}
                className="flex items-start gap-2.5 px-4 py-2.5 transition-colors hover:bg-gray-50 dark:hover:bg-slate-700/40"
              >
                <span className={`mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-lg ${level.className}`}>
                  <Icon className="h-3.5 w-3.5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-900 dark:text-slate-100">{item.message}</p>
                  <p className="mt-0.5 text-xs text-gray-500 dark:text-slate-400">{item.detail}</p>
                </div>
                <span className="shrink-0 font-mono text-[11px] text-gray-400 dark:text-slate-500">{item.time}</span>
              </li>
            );
          })}
        </ul>
      )}
    </AiSectionCard>
  );
}
