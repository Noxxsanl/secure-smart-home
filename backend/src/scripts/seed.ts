import bcrypt from "bcrypt";
import pool from "../config/db";
import { runSql } from "../lib/db";

const MIN_PROD_PASSWORD_LENGTH = 12;

async function seed() {
  // Không có mật khẩu mặc định: schema không seed admin nữa, nên đây là cách tạo admin ở production —
  // một mật khẩu cố định trong code sẽ thành mật khẩu thật của mọi bản triển khai.
  const password = process.env.ADMIN_PASSWORD ?? "";
  const username = process.env.ADMIN_USERNAME?.trim() || "admin";
  if (!password) {
    console.error("[seed] Thiếu ADMIN_PASSWORD (xem backend/.env.example).");
    process.exit(1);
  }
  if (process.env.NODE_ENV === "production" && (password.length < MIN_PROD_PASSWORD_LENGTH || password === "admin123")) {
    console.error(`[seed] ADMIN_PASSWORD quá yếu cho production (cần ≥ ${MIN_PROD_PASSWORD_LENGTH} ký tự, không dùng mật khẩu demo).`);
    process.exit(1);
  }

  // cost 12 khớp với cost dùng trong routes/users.ts ở môi trường production.
  const hash = await bcrypt.hash(password, 12);

  // ON CONFLICT DO NOTHING bỏ qua lặng lẽ nếu admin đã tồn tại (kể cả khác hoa/thường — unique index
  // LOWER(username)), cho phép chạy script này an toàn mỗi lần container khởi động.
  const result = await runSql(
    `INSERT INTO users (username, password_hash, role) VALUES (?, ?, 'admin') ON CONFLICT DO NOTHING`,
    [username, hash]
  );

  if (result.affectedRows > 0) {
    console.log(`[seed] Admin user '${username}' created.`);
  } else {
    console.log(`[seed] Admin user '${username}' already exists, skipped.`);
  }

  await pool.end();
}

seed().catch((err) => {
  console.error("[seed] Error:", err);
  process.exit(1);
});
