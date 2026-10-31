import "./config/env"; // loads .env and validates required vars – must be first import
import type { Server } from "http";
import app from "./app";
import { listWorkers } from "./app.module";
import { runMigrations } from "./infrastructure/database/migrate";
import { attachWsHub } from "./modules/realtime";
import { runDemoSeed } from "./seed/demo-seed";

const PORT = process.env.PORT || 5000;

/** Chạy một bước khởi động; lỗi của một bước không được chặn các bước còn lại (server vẫn phải lên). */
function safeStart(label: string, start: () => void): void {
  try {
    start();
  } catch (err) {
    console.error(`[startup] ${label} failed:`, err instanceof Error ? err.message : "unknown error");
  }
}

async function main(): Promise<void> {
  // Thứ tự khởi động: migrations phải hoàn tất trước khi server nhận request để schema DB luôn mới
  // nhất khi request đầu tiên đến. Migration lỗi (đã log `[migrate] FAILED …`) thì server VẪN chạy
  // nhưng bỏ qua seed vì schema chưa đủ.
  const migrated = await runMigrations();
  if (migrated) {
    try {
      await runDemoSeed();
    } catch (err) {
      console.error("[seed] demo seed failed:", err instanceof Error ? err.message : "unknown error");
    }
  } else {
    console.warn("[startup] migrations incomplete – demo seed skipped");
  }

  // Các service nền (WebSocket, MQTT, job) khởi động bên trong callback listen để chỉ chạy sau khi
  // server đã bind port thành công, tránh race condition ghi DB quá sớm. Worker do từng module khai báo
  // (AppModule.workers, thứ tự theo APP_MODULES trong app.module.ts).
  const server: Server = app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    safeStart("wsHub", () => attachWsHub(server, app)); // WebSocket cho Mobile, dùng chung HTTP server
    for (const worker of listWorkers()) safeStart(worker.name, worker.start);
  });
}

main().catch((err) => {
  console.error("[startup] fatal error:", err instanceof Error ? err.message : "unknown error");
  process.exit(1);
});
