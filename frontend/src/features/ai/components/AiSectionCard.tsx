import type { LucideIcon } from "lucide-react";

type AiSectionCardProps = {
  title: string;
  subtitle?: string;
  icon?: LucideIcon;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
};

// One card shell for every AI Dashboard section so radius, border, surface and
// header rhythm stay identical across 10+ panels.
export default function AiSectionCard({
  title, subtitle, icon: Icon, action, children, className = "", bodyClassName = "",
}: AiSectionCardProps) {
  return (
    <section
      className={`rounded-xl border border-[#E5EAF0] dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm transition-shadow hover:shadow-md ${className}`}
    >
      <header className="flex items-start justify-between gap-3 border-b border-gray-100 dark:border-slate-700 px-4 py-3">
        <div className="flex min-w-0 items-start gap-2.5">
          {Icon && (
            <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand">
              <Icon className="h-3.5 w-3.5" />
            </span>
          )}
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold text-gray-900 dark:text-slate-100">{title}</h2>
            {subtitle && (
              <p className="mt-0.5 text-xs text-gray-500 dark:text-slate-400">{subtitle}</p>
            )}
          </div>
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </header>
      <div className={`p-4 ${bodyClassName}`}>{children}</div>
    </section>
  );
}
