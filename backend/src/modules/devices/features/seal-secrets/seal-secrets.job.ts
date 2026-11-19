// Worker mã hoá dần secret thiết bị còn lưu dạng rõ (FR-12.8): dữ liệu có từ trước khi bật DEVICE_SECRET_KEY, và dòng do
// công cụ dev ghi thẳng (scripts/register-hardware.ts không mã hoá để khỏi phụ thuộc khoá trên máy dev). Chạy 10 s sau
// khi khởi động rồi mỗi 10 phút; chỉ chạy khi đã cấu hình khoá. Không log secret, chỉ log số dòng.
import { env } from "../../../../config/env";
import { sealSecret } from "../../domain/secret-box";
import { listPlaintextSecrets, replacePlaintextSecret } from "../../infrastructure/device-secret.repository";

const FIRST_RUN_DELAY_MS = 10_000;
const RUN_INTERVAL_MS = 10 * 60 * 1000;
const BATCH = 200;
const MAX_BATCHES_PER_RUN = 50;

async function sealOnce(): Promise<void> {
  const key = env.deviceSecretKey;
  if (!key) return;
  try {
    let sealed = 0;
    for (let i = 0; i < MAX_BATCHES_PER_RUN; i++) {
      const rows = await listPlaintextSecrets(BATCH);
      for (const row of rows) {
        if (await replacePlaintextSecret(row.id, row.secret_key, sealSecret(key, row.device_id, row.secret_key))) sealed++;
      }
      if (rows.length < BATCH) break;
    }
    if (sealed > 0) console.log(`[devices] encrypted ${sealed} device secret(s) at rest`);
  } catch (err) {
    console.error("[devices] seal secrets failed:", err instanceof Error ? err.message : "unknown error");
  }
}

let started = false;

export function startSecretSealer(): void {
  if (started || !env.deviceSecretKey) return;
  started = true;
  const first = setTimeout(() => void sealOnce(), FIRST_RUN_DELAY_MS);
  const timer = setInterval(() => void sealOnce(), RUN_INTERVAL_MS);
  first.unref();
  timer.unref();
}
