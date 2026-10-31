import type { DeviceAction } from "@shh/api-client/portal";

export function actionLabel(action: DeviceAction): string {
  return action === "turn_on" ? "Bật" : "Tắt";
}

// ISO weekday 1 = Thứ 2 … 7 = Chủ nhật (CONTRACT: schedule_days).
export const WEEKDAYS: { value: number; short: string }[] = [
  { value: 1, short: "T2" },
  { value: 2, short: "T3" },
  { value: 3, short: "T4" },
  { value: 4, short: "T5" },
  { value: 5, short: "T6" },
  { value: 6, short: "T7" },
  { value: 7, short: "CN" },
];

export function describeDays(days: number[] | null): string {
  if (!days || days.length === 0) return "—";
  const unique = [...new Set(days)].sort((a, b) => a - b);
  if (unique.length === 7) return "mọi ngày";
  if (unique.join(",") === "1,2,3,4,5") return "các ngày trong tuần (T2–T6)";
  if (unique.join(",") === "6,7") return "cuối tuần";
  return unique.map((d) => WEEKDAYS.find((w) => w.value === d)?.short ?? String(d)).join(", ");
}
