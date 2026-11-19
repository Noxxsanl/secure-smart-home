// request_hash (hợp đồng §2.4): SHA-256 hex của JSON chuẩn hoá các bước CHỜ XÁC NHẬN [{index, device_id, command, run_at}]
// theo index tăng dần. Client gửi lại đúng hash lúc xác nhận để chứng minh đã thấy đúng nội dung; khác → 409 REQUEST_CHANGED.
// Thứ tự khoá trong JSON cố định (khai báo literal bên dưới) nên chuỗi băm ổn định. Hàm thuần.
import crypto from "crypto";
import type { PendingStep } from "./agent.types";

export function computeRequestHash(steps: readonly PendingStep[]): string {
  const canonical = [...steps]
    .sort((a, b) => a.index - b.index)
    .map((step) => ({ index: step.index, device_id: step.device_id, command: step.command, run_at: step.run_at }));
  return crypto.createHash("sha256").update(JSON.stringify(canonical), "utf8").digest("hex");
}

/** So sánh hash thời gian hằng (cả hai đã là 64 hex thường). */
export function hashesEqual(a: string, b: string): boolean {
  const left = Buffer.from(a.toLowerCase(), "utf8");
  const right = Buffer.from(b.toLowerCase(), "utf8");
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}
