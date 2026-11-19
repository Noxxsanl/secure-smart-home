import { CARD, CARD_HEADER } from "../classes";

type PanelProps = {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
};

// Khung thẻ có tiêu đề dùng lại ở các trang chi tiết (viền, nền xám đầu thẻ, dark mode).
export default function Panel({ title, subtitle, action, children, className = "", bodyClassName = "" }: PanelProps) {
  return (
    <section className={`overflow-hidden ${CARD} ${className}`}>
      <header className={CARD_HEADER}>
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold text-gray-900 dark:text-slate-100">{title}</h2>
          {subtitle && <p className="mt-0.5 text-xs text-gray-500 dark:text-slate-400">{subtitle}</p>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </header>
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}

/** Dòng trống trong Panel/bảng. */
export function PanelEmpty({ children }: { children: React.ReactNode }) {
  return <p className="px-4 py-6 text-center text-sm text-gray-400 dark:text-slate-500">{children}</p>;
}
