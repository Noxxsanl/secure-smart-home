// Ô thông tin (nhãn nhỏ + giá trị) dùng trong lưới chỉ số của trang chi tiết
// Gateway / Device.
export default function InfoCell({
  label, icon, children,
}: { label: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 p-3.5">
      <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400 dark:text-slate-500">{label}</p>
      <div className="flex items-center gap-2">
        {icon && <span className="shrink-0 text-gray-400 dark:text-slate-500">{icon}</span>}
        <span className="min-w-0 truncate text-sm font-semibold text-gray-900 dark:text-slate-100">{children}</span>
      </div>
    </div>
  );
}
