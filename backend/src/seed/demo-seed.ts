// Seed tài khoản demo. main.ts gọi `await runDemoSeed()` ngay sau migration, trước khi listen.
//
// Từ 2026-11-13 seed KHÔNG tạo dữ liệu mô phỏng nào (nhà KIT, thiết bị is_simulated, số đo giả, firmware/OTA,
// thông báo, audit giả): Admin/Operator chỉ thấy phần cứng thật, đăng ký ở trang "Đăng ký Gateway" của console
// (POST /api/dashboard/smart-homes/register-gateway) hoặc bằng công cụ dev `npm run hw:register`.
// Chỉ tạo tài khoản: admin, operator01, operator02 (nhân viên) và user01 (khách hàng, chủ phần cứng demo).
//
// DB đã chạy seed cũ (marker seed_demo_v2) được dọn một lần bởi cleanupLegacyDemoData (legacy-demo-cleanup.ts) —
// chạy cả khi SEED_DEMO_DATA tắt, vì dữ liệu giả đã nằm sẵn trong DB.
//
// Bảo mật (invariant 1, 2): mật khẩu demo chỉ có trong mã này (đã công khai ở README) và được băm bcrypt cost 12.
// Log chỉ in số lượng.
import bcrypt from "bcrypt";
import { env } from "../config/env";
import { queryOne, runSql, withTransaction } from "../infrastructure/database/db";
import { cleanupLegacyDemoData } from "./legacy-demo-cleanup";

const MARKER = "seed_demo_v3";
const BCRYPT_COST = 12; // khớp identity (register, create-staff)

let createdUsers = 0;

const passwordHashes = new Map<string, Promise<string>>();
/** Cùng một mật khẩu demo dùng chung một hash (bcrypt đã có salt). */
function hashPassword(password: string): Promise<string> {
  let hash = passwordHashes.get(password);
  if (!hash) {
    hash = bcrypt.hash(password, BCRYPT_COST);
    passwordHashes.set(password, hash);
  }
  return hash;
}

async function ensureStaff(username: string, role: "admin" | "operator", fullName: string, password: string): Promise<void> {
  const existing = await queryOne<{ id: number }>("SELECT id FROM users WHERE LOWER(username) = LOWER(?)", [username]);
  if (existing) return;
  await runSql(
    "INSERT INTO users (username, password_hash, role, full_name, status) VALUES (?, ?, ?, ?, 'active')",
    [username, await hashPassword(password), role, fullName]
  );
  createdUsers += 1;
}

interface CustomerSpec {
  email: string;
  fullName: string;
  userTag: string;
  phone: string;
  address: string;
}

async function ensureCustomer(spec: CustomerSpec): Promise<void> {
  const existing = await queryOne<{ id: number }>("SELECT id FROM users WHERE LOWER(email) = LOWER(?)", [spec.email]);
  if (existing) return;
  const hash = await hashPassword("user123");
  // users + customers: ghi 2 bảng → 1 transaction (invariant 9)
  await withTransaction(async (conn) => {
    const user = await runSql(
      "INSERT INTO users (username, email, full_name, password_hash, role, status) VALUES (NULL, ?, ?, ?, 'user', 'active') RETURNING id",
      [spec.email, spec.fullName, hash],
      conn
    );
    await runSql(
      "INSERT INTO customers (user_id, full_name, phone, address, user_tag) VALUES (?, ?, ?, ?, ?)",
      [user.insertId, spec.fullName, spec.phone, spec.address, spec.userTag],
      conn
    );
  });
  createdUsers += 1;
}

export async function runDemoSeed(): Promise<void> {
  await cleanupLegacyDemoData();

  if (!env.seedDemoData) return;
  const done = await queryOne<{ name: string }>("SELECT name FROM _migrations WHERE name = ?", [MARKER]);
  if (done) return;

  await ensureStaff("admin", "admin", "Quản trị viên", "admin123");
  await ensureStaff("operator01", "operator", "Nhân viên vận hành 01", "operator123");
  await ensureStaff("operator02", "operator", "Nhân viên vận hành 02", "operator123");
  // Chủ phần cứng demo — nhà + thiết bị do Admin/Operator đăng ký (trang "Đăng ký Gateway") hoặc `npm run hw:register`
  await ensureCustomer({
    email: "user01@smarthome.local",
    fullName: "Nguyễn Hoàng Đạt",
    userTag: "dat#4821",
    phone: "0901234567",
    address: "12 Nguyễn Huệ, Quận 1, TP. Hồ Chí Minh",
  });

  await runSql("INSERT INTO _migrations (name) VALUES (?) ON CONFLICT DO NOTHING", [MARKER]);
  // Chỉ số lượng — không bao giờ in mật khẩu
  if (createdUsers > 0) console.log(`[seed] created users=${createdUsers}`);
}
