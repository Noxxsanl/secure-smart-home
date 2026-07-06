import pool from "./db";

// Hệ thống migration tuần tự đơn giản.
// Mỗi entry chỉ được áp dụng đúng một lần, theo dõi qua bảng _migrations.
// Migration được thiết kế idempotent (dùng IF NOT EXISTS / INSERT IGNORE).
const migrations: { name: string; sql: string }[] = [
  {
    name: "add_last_ip_to_devices",
    sql: "ALTER TABLE devices ADD COLUMN last_ip VARCHAR(45) NULL AFTER last_seen",
  },
  {
    name: "create_notifications_table",
    sql: `CREATE TABLE IF NOT EXISTS notifications (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT,
      title VARCHAR(255) NOT NULL,
      message TEXT NOT NULL,
      type VARCHAR(64) NOT NULL DEFAULT 'info',
      actor_id INT UNSIGNED NOT NULL,
      actor_username VARCHAR(64) NOT NULL,
      actor_role VARCHAR(32) NOT NULL,
      target_role VARCHAR(32) NOT NULL DEFAULT 'admin',
      related_device_id INT UNSIGNED NULL DEFAULT NULL,
      is_read TINYINT(1) NOT NULL DEFAULT 0,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      INDEX idx_target_is_read (target_role, is_read),
      INDEX idx_created_at (created_at)
    )`,
  },
  {
    // Dọn dữ liệu cũ một lần duy nhất khi migration chạy lần đầu.
    // Từ đây về sau, mqttDataService và data.routes.ts đều tự prune sau mỗi lần insert.
    name: "trim_sensor_data_to_150_per_sensor",
    sql: `DELETE FROM sensor_data WHERE id NOT IN (
      SELECT id FROM (
        SELECT id,
               ROW_NUMBER() OVER (PARTITION BY device_id ORDER BY id DESC) AS rn
        FROM sensor_data
      ) t
      WHERE rn <= 150
    )`,
  },
];

export async function runMigrations(): Promise<void> {
  const conn = await pool.getConnection();
  try {
    // Tạo bảng theo dõi migration nếu chưa tồn tại
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS _migrations (
        name VARCHAR(128) PRIMARY KEY,
        applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    for (const m of migrations) {
      const [rows] = await conn.execute<any[]>(
        "SELECT name FROM _migrations WHERE name = ?",
        [m.name]
      );
      if (rows.length > 0) continue; // đã áp dụng rồi – bỏ qua

      await conn.execute(m.sql);
      await conn.execute("INSERT INTO _migrations (name) VALUES (?)", [m.name]);
      console.log(`[migrate] applied: ${m.name}`);
    }
  } catch (err: any) {
    console.error("[migrate] error:", err.message);
  } finally {
    conn.release();
  }
}
