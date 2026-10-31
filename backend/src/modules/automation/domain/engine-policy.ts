// Quy tắc thuần của automation engine (CONTRACT_V2 §6): đánh giá điều kiện, cooldown, nhãn lỗi.
import { HttpError } from "../../../shared/errors/http-error";

export const SCHEDULE_TICK_MS = 30_000;
export const COOLDOWN_SECONDS = 60;
const EQUALITY_EPSILON = 0.05; // so sánh '=' trên số thực: số đo lẻ 1 chữ số thập phân

export const FAILURE_TEXT: Record<string, string> = {
  DEVICE_OFFLINE: "thiết bị đang ngoại tuyến",
  DEVICE_BLOCKED: "thiết bị đang bị chặn",
  HOME_SUSPENDED: "nhà đang tạm ngưng",
  TIMEOUT: "thiết bị không phản hồi",
  COMMAND_FAILED: "thiết bị báo lỗi",
  NOT_CONTROLLABLE: "thiết bị không điều khiển được",
  NOT_FOUND: "không tìm thấy thiết bị",
  NO_DEVICE: "thiết bị đích đã bị xoá",
};

export function failureCode(err: unknown): string {
  return err instanceof HttpError ? err.code : "UNKNOWN";
}

export function conditionHolds(value: number, operator: ">" | "<" | "=", threshold: number): boolean {
  if (operator === ">") return value > threshold;
  if (operator === "<") return value < threshold;
  return Math.abs(value - threshold) < EQUALITY_EPSILON;
}

export function parseScheduleDays(csv: string | null): number[] {
  if (!csv) return [];
  return csv
    .split(",")
    .map((part) => Number(part.trim()))
    .filter((day) => Number.isInteger(day) && day >= 1 && day <= 7);
}
