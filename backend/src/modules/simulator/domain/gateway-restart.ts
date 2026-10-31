// Trạng thái restart của gateway ảo, giữ ở RAM (không ghi sim_online): crash giữa chừng không để gateway kẹt
// offline vĩnh viễn. Dùng chung cho heartbeat, telemetry và handler lệnh.
const GATEWAY_RESTART_MS = 15_000;

/** gateway id → thời điểm (ms) hết restart. */
const restartingGateways = new Map<number, number>();

export function isRestarting(gatewayId: number | null): boolean {
  if (gatewayId === null) return false;
  const until = restartingGateways.get(gatewayId);
  if (until === undefined) return false;
  if (Date.now() >= until) {
    restartingGateways.delete(gatewayId);
    return false;
  }
  return true;
}

/**
 * Hook restart gateway ảo: gateway (và các node của nó) im lặng 15 s rồi tự quay lại. Được handler lệnh
 * gateway của simulator gọi; export để route/test dùng lại.
 */
export function simulateGatewayRestart(gatewayId: number): void {
  restartingGateways.set(gatewayId, Date.now() + GATEWAY_RESTART_MS);
}
