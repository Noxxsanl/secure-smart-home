import type { CustomerDevice } from "@shh/api-client/portal";
import type { AcSlot } from "./acCodes";

export type AcLearnNotice = { kind: "success" | "error"; text: string };

/** Trạng thái + thao tác học mã IR (do `useAcLearn` cấp, panel chỉ hiển thị). */
export type AcLearnControl = {
  /** Ô đang học (Node đang chờ remote); null = rảnh. */
  learningSlot: AcSlot | null;
  /** Số giây còn lại của cửa sổ bấm remote; 0 = hết giờ, đang chờ Node trả kết quả. */
  secondsLeft: number;
  /** Kết quả lần học gần nhất. */
  notice: AcLearnNotice | null;
  /** Gửi lệnh học 1 ô; trả về khi Node trả lời (có thể ~10–15 s). */
  learn: (device: CustomerDevice, slot: AcSlot) => Promise<void>;
  dismissNotice: () => void;
};
