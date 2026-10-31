// Job dọn refresh token hết hạn (CONTRACT_V2 §6) — tách từ retention job cũ để module identity tự xoá bảng của mình.
// Giữ token hết hạn thêm 7 ngày: phát hiện dùng lại token cũ (reuse detection) còn cần dấu vết của chúng.
import { deleteExpiredRefreshTokenBatch } from "../../infrastructure/refresh-token.repository";

const RUN_INTERVAL_MS = 3600 * 1000;
const FIRST_RUN_DELAY_MS = 30_000;
const BATCH_SIZE = 5000;
const MAX_BATCHES_PER_RUN = 200; // chặn vòng lặp vô hạn nếu DB bất thường
const REFRESH_TOKEN_GRACE_DAYS = 7;
const DAY_MS = 24 * 3600 * 1000;

async function runOnce(): Promise<void> {
  try {
    const cutoff = new Date(Date.now() - REFRESH_TOKEN_GRACE_DAYS * DAY_MS);
    let total = 0;
    for (let i = 0; i < MAX_BATCHES_PER_RUN; i++) {
      const deleted = await deleteExpiredRefreshTokenBatch(cutoff, BATCH_SIZE);
      total += deleted;
      if (deleted < BATCH_SIZE) break;
    }
    if (total > 0) console.log(`[retention] deleted ${total} refresh tokens`);
  } catch (err) {
    console.error("[retention] refresh tokens failed:", err instanceof Error ? err.message : "unknown error");
  }
}

let started = false;

export function startRefreshTokenRetentionJob(): void {
  if (started) return;
  started = true;
  const first = setTimeout(() => void runOnce(), FIRST_RUN_DELAY_MS);
  const timer = setInterval(() => void runOnce(), RUN_INTERVAL_MS);
  first.unref();
  timer.unref();
}
