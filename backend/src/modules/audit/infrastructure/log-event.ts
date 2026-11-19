// Ghi sự kiện vào audit_log — "Log Center" (CONTRACT_V2 §1.1, FR-10.4).
// Hàm duy nhất mà module V2 dùng để ghi log; `log()` cũ (legacy-audit-logger.ts) cũng đi qua đây.
//
// Quy tắc:
//   - KHÔNG BAO GIỜ ném lỗi: ghi log thất bại không được làm hỏng luồng nghiệp vụ.
//   - category/severity mặc định lấy từ domain/event-catalog.ts; truyền vào để ghi đè khi cần.
//   - `details` được lọc các khoá nhạy cảm (password/secret/token/hmac…) — lưới an toàn cho
//     invariant 2, đừng dựa vào nó: người gọi vẫn không được đưa secret vào details.
//   - Truyền `db` (connection đang trong transaction) để dòng log rollback cùng nghiệp vụ.
import pool from "../../../infrastructure/database/pool";
import { runSql, type Queryable } from "../../../infrastructure/database/db";
import type { Severity } from "../../../shared/types/domain";
import { resolveEventMeta, type LogCategory } from "../domain/event-catalog";

export interface LogEventInput {
  eventType: string;
  category?: LogCategory;
  severity?: Severity;
  /** Mô tả tiếng Việt cho Log Center / timeline (≤ 255 ký tự, tự cắt). */
  message?: string | null;
  homeId?: number | null;
  deviceId?: number | null;
  actorUserId?: number | null;
  ip?: string | null;
  userAgent?: string | null;
  details?: Record<string, unknown> | null;
}

// Khoá chứa các từ này sẽ bị che. Cố ý rộng: nhầm thừa còn hơn rò rỉ.
const SENSITIVE_KEY = /pass(word|wd)?|secret|token|hmac|authorization|cookie|code_hash|activation_code|qr_payload|private_key/i;
const MAX_DETAILS_DEPTH = 4;

function redact(value: unknown, depth = 0): unknown {
  if (depth > MAX_DETAILS_DEPTH) return "[truncated]";
  if (Array.isArray(value)) return value.map((item) => redact(item, depth + 1));
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object" && value !== null) {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      out[key] = SENSITIVE_KEY.test(key) ? "[redacted]" : redact(item, depth + 1);
    }
    return out;
  }
  return value;
}

function clip(text: string | null | undefined, max: number): string | null {
  if (text === null || text === undefined) return null;
  return text.length > max ? text.slice(0, max) : text;
}

export async function logEvent(input: LogEventInput, db: Queryable = pool): Promise<void> {
  try {
    const meta = resolveEventMeta(input.eventType);
    const details = input.details ? JSON.stringify(redact(input.details)) : null;
    // home_id: nếu người gọi không truyền mà có device_id thì lấy home_id hiện tại của thiết bị
    // → timeline/Log Center lọc theo nhà được cả với sự kiện thiết bị (xác thực HMAC thất bại…).
    // arch-allow T2: INSERT … (SELECT home_id FROM devices …) phải nguyên tử trong MỘT câu và chạy trên `db` của người
    // gọi (có thể là transaction); tách thành lượt đọc riêng sẽ thêm một vòng truy vấn cho mọi dòng log.
    await runSql(
      `INSERT INTO audit_log
         (event_type, category, severity, device_id, home_id, actor_user_id, message, ip_address, user_agent, details)
       VALUES (?, ?, ?, ?, COALESCE(?, (SELECT home_id FROM devices WHERE id = ?)), ?, ?, ?, ?, ?)`,
      [
        clip(input.eventType, 64) ?? "UNKNOWN",
        input.category ?? meta.category,
        input.severity ?? meta.severity,
        input.deviceId ?? null,
        input.homeId ?? null,
        input.deviceId ?? null,
        input.actorUserId ?? null,
        clip(input.message, 255),
        clip(input.ip, 45),
        clip(input.userAgent, 512),
        details,
      ],
      db
    );
  } catch {
    // audit logging must never crash the main flow
  }
}
