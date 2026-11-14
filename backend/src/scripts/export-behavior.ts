// Xuất dữ liệu huấn luyện AI của MỘT nhà ra 2 file CSV (UTF-8, có header, quote theo RFC 4180):
//   behavior_home<id>_<from>_<to>.csv  ← view v_behavior_training (mỗi lần bật/tắt/đặt mức: nguồn, ngữ cảnh, nhiệt/ẩm phòng…)
//   climate_home<id>_<from>_<to>.csv   ← telemetry_history (nhiệt độ/độ ẩm TRUNG BÌNH THEO GIỜ của từng cảm biến trong nhà)
//   npm run export:behavior -- --home <id> [--from YYYY-MM-DD] [--to YYYY-MM-DD] [--include-simulated]
// Mặc định: 30 ngày gần nhất (tính theo UTC, --to là ngày CUỐI được lấy, gồm cả ngày đó) và BỎ các dòng của thiết bị mô phỏng
// (is_simulated) vì chúng không phản ánh thói quen thật. File ghi vào backend/storage/exports/ (đã gitignore).
//
// Chỉ ĐỌC DB. Dữ liệu không chứa tên/email/secret: người dùng chỉ xuất hiện dưới dạng user_id số (rỗng = bấm tại chỗ/hệ thống).
// Là script composition (như seed.ts): được JOIN bảng của module khác, ngoài quy tắc T1/T2.
import fs from "fs";
import path from "path";
import pool from "../infrastructure/database/pool";
import { queryRows } from "../infrastructure/database/db";

const DAY_MS = 24 * 3600 * 1000;
const DEFAULT_DAYS = 30;
const EXPORT_DIR = path.resolve(__dirname, "../../storage/exports"); // dist/scripts → backend/storage/exports (ts-node: src/scripts → cùng đích)

const BEHAVIOR_COLUMNS = [
  "id", "timestamp", "home_id", "room_id", "device_id", "device_type", "appliance", "action", "previous_state", "new_state",
  "level_before", "level_after", "weekday", "minute_of_day", "is_weekend", "is_holiday", "source", "user_id", "device_command_id",
  "temperature", "humidity", "is_simulated", "seconds_since_prev_change",
] as const;

const CLIMATE_COLUMNS = [
  "device_id", "home_id", "room_id", "metric", "bucket_type", "bucket_start", "avg_value", "min_value", "max_value", "sample_count",
] as const;

interface Args {
  homeId: number;
  from: string;
  to: string;
  includeSimulated: boolean;
}

function fail(message: string): never {
  console.error(`[export:behavior] ${message}`);
  process.exit(1);
}

/** "YYYY-MM-DD" có thật (không chấp nhận 2026-02-30) → Date 00:00 UTC; sai → null. */
function parseDay(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? null : date;
}

function formatDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function parseArgs(argv: string[]): Args {
  const values = new Map<string, string>();
  let includeSimulated = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--include-simulated") {
      includeSimulated = true;
    } else if (arg === "--home" || arg === "--from" || arg === "--to") {
      const value = argv[i + 1];
      if (value === undefined || value.startsWith("--")) fail(`Thiếu giá trị cho ${arg}.`);
      values.set(arg, value);
      i++;
    } else {
      fail(`Tham số không hợp lệ: ${arg}. Dùng: --home <id> [--from YYYY-MM-DD] [--to YYYY-MM-DD] [--include-simulated]`);
    }
  }

  const homeRaw = values.get("--home");
  if (homeRaw === undefined) fail("Thiếu --home <id> (id nhà cần xuất).");
  const homeId = Number(homeRaw);
  if (!Number.isInteger(homeId) || homeId < 1) fail("--home phải là số nguyên ≥ 1.");

  const today = parseDay(formatDay(new Date())) as Date;
  const toRaw = values.get("--to");
  const toDate = toRaw === undefined ? today : parseDay(toRaw);
  if (toDate === null) fail("--to phải có dạng YYYY-MM-DD (ngày có thật).");
  const fromRaw = values.get("--from");
  const fromDate = fromRaw === undefined ? new Date(toDate.getTime() - DEFAULT_DAYS * DAY_MS) : parseDay(fromRaw);
  if (fromDate === null) fail("--from phải có dạng YYYY-MM-DD (ngày có thật).");
  if (fromDate.getTime() > toDate.getTime()) fail("--from không được sau --to.");

  return { homeId, from: formatDay(fromDate), to: formatDay(toDate), includeSimulated };
}

/** Một ô CSV theo RFC 4180: null → rỗng; có dấu phẩy / nháy kép / xuống dòng thì bao trong "…" và nhân đôi nháy kép. */
function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text = value instanceof Date ? value.toISOString() : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function toCsv(columns: readonly string[], rows: Record<string, unknown>[]): string {
  const lines = [columns.join(",")];
  for (const row of rows) lines.push(columns.map((column) => csvCell(row[column])).join(","));
  return lines.join("\r\n") + "\r\n";
}

async function run(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const rangeStart = parseDay(args.from) as Date;
  const rangeEnd = new Date((parseDay(args.to) as Date).getTime() + DAY_MS); // nửa mở: [from 00:00, to+1 ngày 00:00)

  // is_simulated: dòng của thiết bị mô phỏng chỉ lấy khi --include-simulated; điều kiện là hằng chuỗi nội bộ, không phải input
  const simulatedFilter = args.includeSimulated ? "" : "AND is_simulated = FALSE";
  const behavior = await queryRows<Record<string, unknown>>(
    `SELECT ${BEHAVIOR_COLUMNS.map((c) => (c === "timestamp" ? `"timestamp"` : c)).join(", ")}
       FROM v_behavior_training
      WHERE home_id = ? AND "timestamp" >= ? AND "timestamp" < ? ${simulatedFilter}
      ORDER BY "timestamp", id`,
    [args.homeId, rangeStart, rangeEnd]
  );

  // telemetry_history không có cờ mô phỏng → lọc theo thiết bị nguồn
  const climateSimulatedFilter = args.includeSimulated ? "" : "AND d.is_simulated = FALSE";
  const climate = await queryRows<Record<string, unknown>>(
    `SELECT ${CLIMATE_COLUMNS.map((c) => `h.${c}`).join(", ")}
       FROM telemetry_history h
       JOIN devices d ON d.id = h.device_id
      WHERE h.home_id = ? AND h.bucket_start >= ? AND h.bucket_start < ? ${climateSimulatedFilter}
      ORDER BY h.bucket_start, h.device_id, h.metric`,
    [args.homeId, rangeStart, rangeEnd]
  );

  fs.mkdirSync(EXPORT_DIR, { recursive: true });
  const suffix = `home${args.homeId}_${args.from}_${args.to}`;
  const behaviorFile = path.join(EXPORT_DIR, `behavior_${suffix}.csv`);
  const climateFile = path.join(EXPORT_DIR, `climate_${suffix}.csv`);
  fs.writeFileSync(behaviorFile, toCsv(BEHAVIOR_COLUMNS, behavior), "utf8");
  fs.writeFileSync(climateFile, toCsv(CLIMATE_COLUMNS, climate), "utf8");

  console.log(`[export:behavior] nhà ${args.homeId}, ${args.from} → ${args.to} (UTC)${args.includeSimulated ? ", gồm thiết bị mô phỏng" : ""}`);
  console.log(`[export:behavior] ${behavior.length} dòng hành vi  → ${behaviorFile}`);
  console.log(`[export:behavior] ${climate.length} dòng khí hậu   → ${climateFile}`);
}

run()
  .catch((err) => {
    console.error("[export:behavior] failed:", err instanceof Error ? err.message : "unknown error");
    process.exitCode = 1;
  })
  .finally(() => {
    void pool.end();
  });
