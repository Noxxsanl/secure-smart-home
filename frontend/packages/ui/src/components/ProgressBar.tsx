type ProgressBarProps = {
  percent: number;
  colorClassName?: string;
  trackClassName?: string;
  className?: string;
};

// Extracted from the inline `style={{ width: ... }}` bars repeated in
// DevicesPage/OTA — one place to keep the height/rounding/track consistent.
export default function ProgressBar({
  percent,
  colorClassName = "bg-brand",
  trackClassName = "bg-gray-100 dark:bg-slate-700",
  className = "",
}: ProgressBarProps) {
  const clamped = Math.max(0, Math.min(100, percent));
  return (
    <div className={`h-1.5 w-full overflow-hidden rounded-full ${trackClassName} ${className}`}>
      <div
        className={`h-full rounded-full transition-all ${colorClassName}`}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}
