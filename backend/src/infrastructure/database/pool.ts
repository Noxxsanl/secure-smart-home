import { Pool, types } from "pg";
import dotenv from "dotenv";

dotenv.config();

// pg trả COUNT(*) và BIGINT (INT8, oid 20) dạng chuỗi vì có thể vượt 2^53. Id/đếm của đồ án
// luôn nhỏ hơn nhiều, nên ép về number để DTO và phép so sánh `===` không bị bất ngờ.
types.setTypeParser(20, (value) => Number(value));
// Cột DATE (oid 1082) mặc định bị pg đổi thành Date theo múi giờ của process → dễ lệch ngày.
// Giữ nguyên chuỗi 'YYYY-MM-DD' đúng như giá trị lưu trong DB.
types.setTypeParser(1082, (value) => value);
// NUMERIC (oid 1700) cố ý giữ là chuỗi (không mất độ chính xác); toNumberOrNull() ở infrastructure/database/db.ts xử lý.

// `options: -c TimeZone=UTC` ép MỌI connection mới của pool chạy session UTC ngay từ lúc handshake.
// NOW(), CURRENT_TIMESTAMP, EXTRACT(EPOCH …) đều theo múi giờ SESSION; nếu server PostgreSQL
// không chạy UTC thì `expires_at > NOW()` (so Date ghi từ Node với NOW()) sẽ lệch nhiều giờ.
// Cột TIMESTAMPTZ lưu tuyệt đối, nên Date của Node đi vào/ra luôn đúng thời điểm.
// Frontend tự chuyển đổi sang giờ địa phương khi hiển thị.
const pool = new Pool({
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT) || 5432,
  user: process.env.DB_USER, // bắt buộc (config/env.ts) — không fallback về superuser `postgres` (least privilege)
  password: process.env.DB_PASS || "",
  database: process.env.DB_NAME || "secure_smart_home_iot",
  max: 10, // phù hợp lượng request đồng thời dự kiến; tăng nếu thấy log pool exhaustion
  options: "-c TimeZone=UTC",
});

// Lỗi trên connection đang rảnh (DB restart, mất mạng) được pg phát ra qua sự kiện `error` của pool;
// không có handler thì Node coi là uncaught exception và sập cả backend. Ghi log, pool tự tạo connection mới.
pool.on("error", (err) => {
  console.error("[db] idle client error:", err.message);
});

export default pool;
