import bcrypt from "bcrypt";
import pool from "../config/db";

async function seed() {
  const password = process.env.ADMIN_PASSWORD || "admin123";
  const username = process.env.ADMIN_USERNAME || "admin";

  // cost 12 khớp với cost dùng trong routes/users.ts ở môi trường production.
  const hash = await bcrypt.hash(password, 12);

  // INSERT IGNORE bỏ qua lặng lẽ nếu admin đã tồn tại,
  // cho phép chạy script này an toàn mỗi lần container khởi động.
  const [result] = await pool.execute(
    `INSERT IGNORE INTO users (username, password_hash, role) VALUES (?, ?, 'admin')`,
    [username, hash]
  );

  const rows = result as { affectedRows: number };
  if (rows.affectedRows > 0) {
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
