// Dựng "thẻ cần xác nhận" trả cho client từ agent_requests.pending_steps: tên thiết bị/phòng và nhãn hành động do BACKEND
// sinh (actionLabel) — không lấy chữ nào từ LLM ngoài `reason` (hiển thị như văn bản thường, không phải chỉ dẫn).
import { listDeviceRowsByIds } from "../../devices";
import { actionLabel } from "../../schedules";
import type { AgentRequestRow, PendingStep, PendingStepView, PendingView } from "./agent.types";

const DELETED_DEVICE_NAME = "Thiết bị đã xoá";

export async function buildPendingView(row: Pick<AgentRequestRow, "id" | "request_hash" | "expires_at">, steps: readonly PendingStep[]): Promise<PendingView | null> {
  if (steps.length === 0 || row.request_hash === null || row.expires_at === null) return null;
  const devices = new Map((await listDeviceRowsByIds([...new Set(steps.map((step) => step.device_id))])).map((device) => [device.id, device]));
  const views: PendingStepView[] = [...steps]
    .sort((a, b) => a.index - b.index)
    .map((step) => {
      const device = devices.get(step.device_id);
      return {
        index: step.index,
        device_id: step.device_id,
        device_name: device?.device_name ?? DELETED_DEVICE_NAME,
        room_name: device?.room_name ?? null,
        action_label: actionLabel(step.command, device?.appliance ?? null, device?.device_name ?? null),
        run_at: step.run_at,
        reason: step.reason,
      };
    });
  return { request_id: row.id, request_hash: row.request_hash, expires_at: row.expires_at.toISOString(), steps: views };
}
