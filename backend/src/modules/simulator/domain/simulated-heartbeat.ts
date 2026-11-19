// Heartbeat thiết bị ảo (20 s/lần từ worker; route power gọi để bật nguồn là lên online ngay).
import { listHeartbeatCandidates, markSimulatedSeen } from "../infrastructure/simulator.repository";
import { isRestarting } from "./gateway-restart";

/** Đặt last_seen cho mọi thiết bị ảo đang "bật nguồn" (cũng được route power gọi để bật là lên ngay). */
export async function runSimulatedHeartbeat(): Promise<void> {
  try {
    const rows = await listHeartbeatCandidates();
    const alive = rows
      .filter((row) => !isRestarting(row.device_type === "gateway" ? row.id : row.gateway_device_id))
      .map((row) => row.id);
    if (alive.length === 0) return;
    await markSimulatedSeen(alive);
  } catch (err) {
    console.error("[simulator] heartbeat failed:", err instanceof Error ? err.message : "unknown error");
  }
}
