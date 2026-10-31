// Registry thiết bị giả lập: simulator đăng ký handler để tự "ack" cho thiết bị is_simulated=1 (không đi qua MQTT).
import { ACK_TIMEOUT_MS, type AckOutcome } from "./pending-acks";
import type { SimulatedCommand, SimulatedCommandHandler } from "./command.types";

let simulatedHandler: SimulatedCommandHandler | null = null;

/** Simulator gọi lúc khởi động. Gọi lại sẽ thay handler cũ. */
export function registerSimulatedCommandHandler(handler: SimulatedCommandHandler): void {
  simulatedHandler = handler;
}

/** Handler đang đăng ký (null nếu simulator chưa chạy — lệnh cho thiết bị giả lập khi đó đi MQTT và TIMEOUT). */
export function getSimulatedHandler(): SimulatedCommandHandler | null {
  return simulatedHandler;
}

export async function runSimulated(handler: SimulatedCommandHandler, command: SimulatedCommand): Promise<AckOutcome> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<AckOutcome>((resolve) => {
    timer = setTimeout(() => resolve({ kind: "timeout", errorCode: "ACK_TIMEOUT" }), ACK_TIMEOUT_MS);
  });
  const handled = handler(command).then(
    (ack): AckOutcome => ({ kind: "ack", status: ack.status, power: typeof ack.power === "boolean" ? ack.power : null }),
    (): AckOutcome => ({ kind: "ack", status: "error", power: null })
  );
  try {
    return await Promise.race([handled, timeout]);
  } finally {
    clearTimeout(timer);
  }
}
