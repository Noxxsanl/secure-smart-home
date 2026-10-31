// Sổ "ack đang chờ" (pending-request registry): mỗi lệnh gửi tới thiết bị thật đăng ký một mục TRƯỚC khi publish
// (để không lỡ ack về cực nhanh), features/command-ack resolve khi ack hợp lệ về, hoặc hết ACK_TIMEOUT_MS thì timeout.
import type { GatewaySigner } from "../../devices";

export const ACK_TIMEOUT_MS = 5000;

export type AckOutcome =
  | { kind: "ack"; status: "ok" | "error"; power: boolean | null }
  | { kind: "timeout"; errorCode: string };

export interface PendingAck {
  homeId: number;
  gatewayDbId: number;
  gatewayUid: string;
  deviceUid: string;
  /** Bộ ký của gateway (module devices) để kiểm HMAC ack — chỉ trong RAM, xoá khi xong; không chứa secret dạng giá trị. */
  signer: GatewaySigner;
  resolve: (outcome: AckOutcome) => void;
  badHmacLogged: boolean;
}

const pendingAcks = new Map<string, PendingAck>();

export function registerPending(
  commandUuid: string,
  entry: Omit<PendingAck, "resolve" | "badHmacLogged">
): { promise: Promise<AckOutcome>; cancel: () => void } {
  let settle: (outcome: AckOutcome) => void = () => undefined;
  const promise = new Promise<AckOutcome>((resolve) => {
    settle = resolve;
  });
  const timer = setTimeout(() => {
    pendingAcks.delete(commandUuid);
    settle({ kind: "timeout", errorCode: "ACK_TIMEOUT" });
  }, ACK_TIMEOUT_MS);
  pendingAcks.set(commandUuid, {
    ...entry,
    badHmacLogged: false,
    resolve: (outcome) => {
      clearTimeout(timer);
      pendingAcks.delete(commandUuid);
      settle(outcome);
    },
  });
  return {
    promise,
    cancel: () => {
      clearTimeout(timer);
      pendingAcks.delete(commandUuid);
    },
  };
}

/** Mục đang chờ của một command_id; undefined nếu ack lạ hoặc đến muộn sau timeout. */
export function findPendingAck(commandUuid: string): PendingAck | undefined {
  return pendingAcks.get(commandUuid);
}
