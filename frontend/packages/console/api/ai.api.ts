import { dashApi } from "@smarthome/console/api/client";
import type { HabitJobResult } from "@smarthome/console/api/types";

// §5 AI — chạy ngay job phân tích thói quen (ADMIN). Job chỉ TẠO gợi ý; không
// điều khiển thiết bị (bất biến 8) — khách hàng phải chấp nhận trên app.

export function runHabitSuggestions() {
  return dashApi<HabitJobResult>("/ai/suggestions/run", { method: "POST" });
}
