// Dọn MỘT LẦN dữ liệu mô phỏng mà seed cũ (marker seed_demo_v2, trước 2026-11-13) đã ghi vào DB, để Admin/Operator chỉ
// còn thấy phần cứng thật. Chỉ chạy trên DB có marker seed_demo_v2 và chưa có marker seed_demo_v3_cleanup; mọi lệnh
// xoá + marker nằm trong MỘT transaction (lỗi giữa chừng → không xoá gì, lần khởi động sau thử lại).
//
// Bị xoá:
//   - Nhà "mô phỏng": có thiết bị và MỌI thiết bị đều is_simulated (nhà KIT của seed — Nhà Quận 7, Kit KIT_A #0003,
//     Kit KIT_B #0004, Kit KIT_A #0005 — và nhà tạo bằng Provisioning Wizard khi bật bộ mô phỏng) cùng thiết bị, số đo,
//     log, lịch sử kích hoạt, OTA theo nhà của chúng. Nhà có gateway thật (đăng ký bằng hw:register / trang Đăng ký
//     Gateway) giữ nguyên, kể cả các relay mô phỏng (đèn/quạt/rèm) bên trong.
//   - Thiết bị mô phỏng không thuộc nhà nào.
//   - Firmware/OTA, thông báo nhân viên và audit chung do seed cũ tạo (nhận diện theo checksum / nội dung cố định).
//   - Khách demo hung@ và kimanh@ (trừ khi đang làm chủ một nhà thật).
// Giữ: admin, operator01, operator02, user01 và mọi dữ liệu thật.
import type { PoolClient } from "pg";
import { placeholders, queryOne, queryRows, runSql, withTransaction, type SqlParam } from "../infrastructure/database/db";
import { sha256Hex } from "../shared/crypto";

const LEGACY_MARKER = "seed_demo_v2";
const CLEANUP_MARKER = "seed_demo_v3_cleanup";

const DEMO_CUSTOMER_EMAILS = ["hung@smarthome.local", "kimanh@smarthome.local"];

const SEED_FIRMWARE = [
  ["gateway", "2.3.1"],
  ["node", "1.4.0"],
  ["gateway", "2.4.0-beta.1"],
] as const;

// Thông báo nhân viên (user_id NULL) do seed cũ ghi — nội dung cố định
const SEED_STAFF_NOTIFICATIONS = [
  'Nhà "Nhà Quận 7" vừa được khách hàng kích hoạt.',
  'Gateway của nhà "Nhà Quận 7" đã mất kết nối.',
  "Đợt cập nhật firmware node 1.4.0 đã hoàn tất trên mọi thiết bị.",
  'Nhà "Kit KIT_A #0003" đã sẵn sàng, chưa có chủ nhà.',
  'Mã kích hoạt của "Kit KIT_A #0005" đã hết hạn — cần cấp mã mới.',
  "operator01 được cấp quyền xem nhà Quận 7 trong 4 giờ (Ticket #1024).",
];

// Audit không gắn nhà do seed cũ ghi (chỉ xoá dòng tạo trước thời điểm seed cũ hoàn tất)
const SEED_GLOBAL_AUDIT_MESSAGES = [
  "Quản trị viên đăng nhập",
  "Nhân viên vận hành đăng nhập",
  "Đăng nhập thất bại: sai thông tin đăng nhập",
  "Backend kết nối Broker MQTT (TLS)",
  "Nhập mã kích hoạt không tồn tại",
  ...SEED_FIRMWARE.map(([type, version]) => `Tải lên firmware ${type} ${version}`),
];

async function deleteIn(conn: PoolClient, sqlHead: string, ids: readonly SqlParam[], tail = ""): Promise<number> {
  if (ids.length === 0) return 0;
  const result = await runSql(`${sqlHead} IN (${placeholders(ids.length)})${tail}`, [...ids], conn);
  return result.affectedRows;
}

export async function cleanupLegacyDemoData(): Promise<void> {
  const legacy = await queryOne<{ applied_at: Date }>("SELECT applied_at FROM _migrations WHERE name = ?", [LEGACY_MARKER]);
  if (!legacy) return;
  const done = await queryOne<{ name: string }>("SELECT name FROM _migrations WHERE name = ?", [CLEANUP_MARKER]);
  if (done) return;

  const counts = await withTransaction(async (conn) => {
    // 1. Nhà mô phỏng: có thiết bị và không có thiết bị thật nào
    const homeIds = (
      await queryRows<{ id: number }>(
        `SELECT h.id FROM smart_homes h
          WHERE EXISTS (SELECT 1 FROM devices d WHERE d.home_id = h.id)
            AND NOT EXISTS (SELECT 1 FROM devices d WHERE d.home_id = h.id AND d.is_simulated = FALSE)`,
        [],
        conn
      )
    ).map((row) => row.id);
    const deletedHomes = new Set(homeIds);

    // 2. Khách demo — giữ lại nếu đang làm chủ một nhà không bị xoá (đã được dùng với phần cứng thật)
    const demoUsers = await queryRows<{ id: number }>(
      `SELECT id FROM users WHERE role = 'user' AND LOWER(email) IN (${placeholders(DEMO_CUSTOMER_EMAILS.length)})`,
      DEMO_CUSTOMER_EMAILS,
      conn
    );
    const userIds: number[] = [];
    for (const user of demoUsers) {
      const owned = await queryRows<{ id: number }>("SELECT id FROM smart_homes WHERE owner_user_id = ?", [user.id], conn);
      if (owned.every((home) => deletedHomes.has(home.id))) userIds.push(user.id);
    }

    // 3. Xoá theo nhà. devices.home_id là ON DELETE SET NULL nên phải xoá thiết bị trước (CASCADE dọn số đo, lệnh,
    //    ảnh, lịch sử OTA…); xoá nhà CASCADE dọn phòng, thành viên, mã kích hoạt, thông báo, rule, grant…
    await deleteIn(conn, "DELETE FROM audit_log WHERE home_id", homeIds);
    await deleteIn(conn, "DELETE FROM activation_logs WHERE home_id", homeIds);
    await deleteIn(conn, "DELETE FROM ota_jobs WHERE scope_type = 'home' AND scope_id", homeIds);
    const devices = await deleteIn(conn, "DELETE FROM devices WHERE home_id", homeIds);
    const homes = await deleteIn(conn, "DELETE FROM smart_homes WHERE id", homeIds);
    const orphanDevices = await runSql("DELETE FROM devices WHERE home_id IS NULL AND is_simulated = TRUE", [], conn);

    // 4. Firmware/OTA, thông báo nhân viên, audit chung của seed cũ
    const firmware = await deleteIn(
      conn,
      "DELETE FROM firmware WHERE checksum_sha256",
      SEED_FIRMWARE.map(([type, version]) => sha256Hex(`seed-firmware-${type}-${version}`))
    );
    await deleteIn(conn, "DELETE FROM notifications WHERE user_id IS NULL AND message", SEED_STAFF_NOTIFICATIONS);
    await runSql(
      `DELETE FROM audit_log
        WHERE home_id IS NULL AND created_at <= ? AND message IN (${placeholders(SEED_GLOBAL_AUDIT_MESSAGES.length)})`,
      [legacy.applied_at, ...SEED_GLOBAL_AUDIT_MESSAGES],
      conn
    );

    // 5. Khách demo (CASCADE: customers, thành viên, thông báo, refresh token)
    await deleteIn(conn, "DELETE FROM audit_log WHERE actor_user_id", userIds);
    await deleteIn(conn, "DELETE FROM activation_logs WHERE user_id", userIds);
    const users = await deleteIn(conn, "DELETE FROM users WHERE id", userIds);

    await runSql("INSERT INTO _migrations (name) VALUES (?) ON CONFLICT DO NOTHING", [CLEANUP_MARKER], conn);
    return { homes, devices: devices + orphanDevices.affectedRows, firmware, users };
  });

  // Chỉ số lượng
  console.log(
    `[seed] removed legacy demo data: homes=${counts.homes} devices=${counts.devices} ` +
      `firmware=${counts.firmware} customers=${counts.users}`
  );
}
