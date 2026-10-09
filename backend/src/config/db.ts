import mysql from "mysql2/promise";
import dotenv from "dotenv";

dotenv.config();

// timezone "+00:00" ép tất cả giá trị Date được lưu/đọc theo UTC,
// tránh lỗi ngầm khi timezone của OS server khác timezone của MySQL.
// Frontend tự chuyển đổi sang giờ địa phương khi hiển thị.
const pool = mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASS || "",
  database: process.env.DB_NAME || "iot_managerDeviceIoT",
  waitForConnections: true,
  connectionLimit: 10, // phù hợp lượng request đồng thời dự kiến; tăng nếu thấy log pool exhaustion
  queueLimit: 0,       // 0 = hàng đợi không giới hạn; không bỏ request khi burst traffic
  timezone: "+00:00",
});

// Tuỳ chọn `timezone` ở trên chỉ ảnh hưởng cách mysql2 chuyển Date <-> chuỗi; còn NOW(),
// CURRENT_TIMESTAMP, UNIX_TIMESTAMP() của MySQL dùng múi giờ của SESSION. Nếu server MySQL
// không chạy UTC thì `expires_at > NOW()` (so Date ghi từ Node với NOW()) sẽ lệch nhiều giờ.
// Ép mỗi connection mới về UTC để mọi so sánh thời gian trong SQL khớp với giá trị Date của Node.
pool.pool.on("connection", (connection) => {
  connection.query("SET time_zone = '+00:00'", (err) => {
    if (err) console.error("[db] failed to set session time_zone to UTC:", err.message);
  });
});

export default pool;
