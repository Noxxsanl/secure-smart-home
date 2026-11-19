type StatsCardProps = {
  title: string;
  value: number | string;
  subtitle: string;
  icon: React.ReactNode;
  accent: string;
  iconBg?: string;
};

export default function StatsCard({ title, value, subtitle, icon, accent, iconBg }: StatsCardProps) {
  return (
    <div className="rounded-md border border-[#E5EAF0] dark:border-slate-700 bg-white dark:bg-slate-800 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className={`inline-flex h-8 w-8 items-center justify-center rounded ${iconBg ?? "bg-gray-100 dark:bg-slate-700"}`}>
          {icon}
        </div>
        <div className={`inline-flex rounded px-2 py-0.5 text-[10px] font-semibold ${accent}`}>
          Live
        </div>
      </div>
      <p className="mt-3 text-2xl font-semibold text-gray-900 dark:text-slate-100">{value}</p>
      <p className="mt-0.5 text-sm font-medium text-gray-700 dark:text-slate-300">{title}</p>
      <p className="mt-0.5 text-xs leading-4 text-gray-400 dark:text-slate-500">{subtitle}</p>
    </div>
  );
}
