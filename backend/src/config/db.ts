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

export default pool;
