import type { LucideIcon } from "lucide-react";
import { Lightbulb, Fan, DoorOpen, Cpu } from "lucide-react";
import type { AiDeviceCategory } from "@/shared/mock/ai";

const CATEGORY_ICONS: Record<AiDeviceCategory, LucideIcon> = {
  light: Lightbulb,
  fan: Fan,
  door: DoorOpen,
  other: Cpu,
};

type DeviceCategoryIconProps = {
  category: AiDeviceCategory;
  className?: string;
};

// Keeps one icon per device family across the table, the recommendation panel
// and the distribution legend so the same concept never gets two glyphs.
export default function DeviceCategoryIcon({ category, className = "" }: DeviceCategoryIconProps) {
  const Icon = CATEGORY_ICONS[category];
  return <Icon className={`h-3.5 w-3.5 shrink-0 text-gray-400 dark:text-slate-500 ${className}`} />;
}
