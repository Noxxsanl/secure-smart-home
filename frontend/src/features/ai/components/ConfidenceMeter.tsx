import ProgressBar from "@/shared/ui/ProgressBar";

type ConfidenceMeterProps = {
  value: number;
  className?: string;
};

// Bar + number together: the bar makes rows comparable at a glance, the number
// keeps the exact value readable without relying on color alone.
export default function ConfidenceMeter({ value, className = "" }: ConfidenceMeterProps) {
  const colorClassName = value >= 90 ? "bg-success" : value >= 80 ? "bg-brand" : "bg-warning";
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div className="w-16 shrink-0">
        <ProgressBar percent={value} colorClassName={colorClassName} />
      </div>
      <span className="font-mono text-xs tabular-nums text-gray-600 dark:text-slate-300">{value}%</span>
    </div>
  );
}
