import type { PoolConnection, RowDataPacket } from "mysql2/promise";
import { EVENT_CATALOG_ENTRIES, FALLBACK_EVENT_META } from "../modules/logs/eventCatalog";
import pool from "./db";

// Hệ thống migration tuần tự đơn giản.
// Mỗi entry chỉ được áp dụng đúng một lần, theo dõi qua bảng _migrations.
// QUY TẮC: chỉ THÊM vào cuối mảng, mỗi entry đúng 1 câu SQL (conn.execute không chạy
// multi-statement), không sửa/xoá/đổi tên entry cũ. Entry V2 (từ add `alter_users_for_customers`)
// theo CONTRACT_V2 §1 và docs/04 §7; DDL tương đương cho DB mới nằm ở database/migrations/001_schema.sql.

const TABLE_OPTS = "ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci";

// Backfill category/severity cho audit_log cũ: sinh CASE từ chính danh mục dùng bởi logEvent()
// (modules/logs/eventCatalog.ts) để SQL và code không thể lệch nhau. Giá trị đều là hằng số
// trong mã nguồn (không có input người dùng) nên nối chuỗi ở đây an toàn.
function sqlQuote(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function eventCaseSql(pick: (entry: (typeof EVENT_CATALOG_ENTRIES)[number]) => string, fallback: string): string {
  const whens = EVENT_CATALOG_ENTRIES.map((entry) => `WHEN ${sqlQuote(entry[0])} THEN ${sqlQuote(pick(entry))}`).join(" ");
  return `CASE event_type ${whens} ELSE ${sqlQuote(fallback)} END`;
}

const AUDIT_BACKFILL_SQL = `UPDATE audit_log SET
  category = ${eventCaseSql((entry) => entry[1], FALLBACK_EVENT_META.category)},
  severity = ${eventCaseSql((entry) => entry[2], FALLBACK_EVENT_META.severity)}`;

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
    // (V2 bỏ cơ chế prune 150 dòng/sensor ở lúc insert — thay bằng retention theo thời gian,
    // xem modules/maintenance/retention.job.ts — nhưng entry này giữ nguyên vì đã có DB áp dụng.)
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

  // ───────────────────────── V2: tài khoản & khách hàng ─────────────────────────
  {
    // Khách hàng không có username (đăng nhập bằng email/user_tag) nên username phải NULL được;
    // uq_users_username giữ nguyên (UNIQUE cho phép nhiều NULL).
    name: "alter_users_for_customers",
    sql: `ALTER TABLE users
      MODIFY COLUMN username VARCHAR(64) NULL,
      MODIFY COLUMN role ENUM('admin','operator','user') NOT NULL DEFAULT 'operator',
      ADD COLUMN email VARCHAR(190) NULL AFTER username,
      ADD COLUMN full_name VARCHAR(128) NULL AFTER email,
      ADD COLUMN status ENUM('active','locked') NOT NULL DEFAULT 'active' AFTER role,
      ADD UNIQUE KEY uq_users_email (email)`,
  },
  {
    name: "create_customers_table",
    sql: `CREATE TABLE IF NOT EXISTS customers (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT,
      user_id INT UNSIGNED NOT NULL,
      full_name VARCHAR(128) NOT NULL,
      phone VARCHAR(20) NULL,
      address VARCHAR(255) NULL,
      user_tag VARCHAR(32) NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_customers_user_id (user_id),
      UNIQUE KEY uq_customers_user_tag (user_tag),
      CONSTRAINT fk_customers_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
    ) ${TABLE_OPTS}`,
  },

  // ───────────────────────── V2: nhà, phòng ─────────────────────────
  {
    name: "create_smart_homes_table",
    sql: `CREATE TABLE IF NOT EXISTS smart_homes (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT,
      name VARCHAR(128) NOT NULL,
      package_code ENUM('KIT_A','KIT_B') NOT NULL,
      address VARCHAR(255) NULL,
      expected_owner_name VARCHAR(128) NULL,
      timezone VARCHAR(64) NOT NULL DEFAULT 'Asia/Ho_Chi_Minh',
      status ENUM('unclaimed','active','suspended') NOT NULL DEFAULT 'unclaimed',
      owner_user_id INT UNSIGNED NULL,
      created_by INT UNSIGNED NULL,
      claimed_at DATETIME NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_smart_homes_status (status),
      KEY idx_smart_homes_owner (owner_user_id),
      CONSTRAINT fk_smart_homes_owner FOREIGN KEY (owner_user_id) REFERENCES users (id) ON DELETE SET NULL,
      CONSTRAINT fk_smart_homes_created_by FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE SET NULL
    ) ${TABLE_OPTS}`,
  },
  {
    name: "create_rooms_table",
    sql: `CREATE TABLE IF NOT EXISTS rooms (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT,
      home_id INT UNSIGNED NOT NULL,
      name VARCHAR(64) NOT NULL,
      room_type VARCHAR(32) NOT NULL,
      sort_order SMALLINT UNSIGNED NOT NULL DEFAULT 0,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_rooms_home (home_id),
      CONSTRAINT fk_rooms_home FOREIGN KEY (home_id) REFERENCES smart_homes (id) ON DELETE CASCADE
    ) ${TABLE_OPTS}`,
  },

  // ───────────────────────── V2: devices ─────────────────────────
  {
    // 1 dòng = 1 thiết bị logic. device_type giữ 'sensor'|'gateway' (danh tính cho HMAC);
    // loại chức năng ở `category`. secret_key giữ nguyên (FR-12.8 ngoài phạm vi vòng này).
    name: "alter_devices_for_smart_home",
    sql: `ALTER TABLE devices
      ADD COLUMN home_id INT UNSIGNED NULL,
      ADD COLUMN room_id INT UNSIGNED NULL,
      ADD COLUMN gateway_device_id INT UNSIGNED NULL,
      ADD COLUMN node_uid VARCHAR(64) NULL,
      ADD COLUMN category ENUM('gateway','sensor','relay','camera','door_contact') NOT NULL DEFAULT 'sensor',
      ADD COLUMN power_state TINYINT(1) NULL,
      ADD COLUMN firmware_version VARCHAR(32) NULL,
      ADD COLUMN rssi SMALLINT NULL,
      ADD COLUMN wifi_ssid VARCHAR(64) NULL,
      ADD COLUMN provision_status ENUM('pending','provisioned') NOT NULL DEFAULT 'pending',
      ADD COLUMN is_simulated TINYINT(1) NOT NULL DEFAULT 0,
      ADD COLUMN sim_online TINYINT(1) NOT NULL DEFAULT 1,
      ADD COLUMN updated_at DATETIME NULL ON UPDATE CURRENT_TIMESTAMP,
      ADD KEY idx_devices_home_room (home_id, room_id),
      ADD KEY idx_devices_gateway (gateway_device_id),
      ADD KEY idx_devices_category (category),
      ADD CONSTRAINT fk_devices_home FOREIGN KEY (home_id) REFERENCES smart_homes (id) ON DELETE SET NULL,
      ADD CONSTRAINT fk_devices_room FOREIGN KEY (room_id) REFERENCES rooms (id) ON DELETE SET NULL,
      ADD CONSTRAINT fk_devices_gateway FOREIGN KEY (gateway_device_id) REFERENCES devices (id) ON DELETE SET NULL`,
  },
  {
    name: "backfill_devices_category_gateway",
    sql: "UPDATE devices SET category = 'gateway' WHERE device_type = 'gateway'",
  },
  {
    name: "backfill_devices_provision_status",
    sql: "UPDATE devices SET provision_status = 'provisioned' WHERE last_seen IS NOT NULL",
  },

  // ───────────────────────── V2: notifications, audit_log ─────────────────────────
  {
    // Thông báo cho khách: actor_* có thể NULL (do hệ thống phát), user_id = người nhận,
    // mỗi người một dòng (target_role='user').
    name: "alter_notifications_for_customers",
    sql: `ALTER TABLE notifications
      MODIFY COLUMN actor_id INT UNSIGNED NULL,
      MODIFY COLUMN actor_username VARCHAR(64) NULL,
      MODIFY COLUMN actor_role VARCHAR(32) NULL,
      ADD COLUMN severity ENUM('critical','warning','info','success') NOT NULL DEFAULT 'info' AFTER type,
      ADD COLUMN user_id INT UNSIGNED NULL AFTER related_device_id,
      ADD COLUMN home_id INT UNSIGNED NULL AFTER user_id,
      ADD KEY idx_notifications_user (user_id, is_read, created_at),
      ADD CONSTRAINT fk_notifications_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
      ADD CONSTRAINT fk_notifications_home FOREIGN KEY (home_id) REFERENCES smart_homes (id) ON DELETE CASCADE`,
  },
  {
    // audit_log thành kho của Log Center. Không FK home_id/actor_user_id: dòng log phải sống sau khi xoá nhà/user.
    name: "alter_audit_log_for_log_center",
    sql: `ALTER TABLE audit_log
      ADD COLUMN category ENUM('gateway','device','provision','mqtt','security','auth','activity','automation','ota','error') NOT NULL DEFAULT 'security' AFTER event_type,
      ADD COLUMN severity ENUM('critical','warning','info','success') NOT NULL DEFAULT 'info' AFTER category,
      ADD COLUMN home_id INT UNSIGNED NULL AFTER device_id,
      ADD COLUMN actor_user_id INT UNSIGNED NULL AFTER home_id,
      ADD COLUMN message VARCHAR(255) NULL AFTER actor_user_id,
      ADD KEY idx_audit_log_category_created (category, created_at),
      ADD KEY idx_audit_log_home_created (home_id, created_at)`,
  },
  {
    name: "backfill_audit_log_category_severity",
    sql: AUDIT_BACKFILL_SQL,
  },

  // ───────────────────────── V2: thành viên & kích hoạt ─────────────────────────
  {
    // Lời mời đang chờ: user_id NULL + invite_email NOT NULL. Thành viên hiệu lực:
    // user_id NOT NULL và (expires_at IS NULL OR expires_at > NOW()).
    name: "create_smart_home_members_table",
    sql: `CREATE TABLE IF NOT EXISTS smart_home_members (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT,
      home_id INT UNSIGNED NOT NULL,
      user_id INT UNSIGNED NULL,
      member_role ENUM('OWNER','CONTROLLER','VIEWER','GUEST') NOT NULL,
      display_name VARCHAR(128) NULL,
      invite_email VARCHAR(190) NULL,
      invite_expires_at DATETIME NULL,
      invited_by INT UNSIGNED NULL,
      expires_at DATETIME NULL,
      accepted_at DATETIME NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_smart_home_members_home_user (home_id, user_id),
      KEY idx_smart_home_members_user (user_id),
      KEY idx_smart_home_members_invite (invite_email),
      CONSTRAINT fk_smart_home_members_home FOREIGN KEY (home_id) REFERENCES smart_homes (id) ON DELETE CASCADE,
      CONSTRAINT fk_smart_home_members_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
      CONSTRAINT fk_smart_home_members_invited_by FOREIGN KEY (invited_by) REFERENCES users (id) ON DELETE SET NULL
    ) ${TABLE_OPTS}`,
  },
  {
    // Thiết bị GUEST được phép dùng (FR-6.3).
    name: "create_member_device_access_table",
    sql: `CREATE TABLE IF NOT EXISTS member_device_access (
      member_id INT UNSIGNED NOT NULL,
      device_id INT UNSIGNED NOT NULL,
      PRIMARY KEY (member_id, device_id),
      CONSTRAINT fk_member_device_access_member FOREIGN KEY (member_id) REFERENCES smart_home_members (id) ON DELETE CASCADE,
      CONSTRAINT fk_member_device_access_device FOREIGN KEY (device_id) REFERENCES devices (id) ON DELETE CASCADE
    ) ${TABLE_OPTS}`,
  },
  {
    // Chỉ lưu sha256 của mã (NFR-S2); bản rõ trả đúng 1 lần lúc tạo.
    name: "create_activation_tokens_table",
    sql: `CREATE TABLE IF NOT EXISTS activation_tokens (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      home_id INT UNSIGNED NOT NULL,
      code_hash CHAR(64) NOT NULL,
      token_type ENUM('INITIAL_CLAIM') NOT NULL DEFAULT 'INITIAL_CLAIM',
      expires_at DATETIME NOT NULL,
      used_at DATETIME NULL,
      used_by_user_id INT UNSIGNED NULL,
      revoked_at DATETIME NULL,
      revoked_by INT UNSIGNED NULL,
      created_by INT UNSIGNED NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_activation_tokens_code_hash (code_hash),
      KEY idx_activation_tokens_home (home_id),
      CONSTRAINT fk_activation_tokens_home FOREIGN KEY (home_id) REFERENCES smart_homes (id) ON DELETE CASCADE,
      CONSTRAINT fk_activation_tokens_used_by FOREIGN KEY (used_by_user_id) REFERENCES users (id) ON DELETE SET NULL,
      CONSTRAINT fk_activation_tokens_revoked_by FOREIGN KEY (revoked_by) REFERENCES users (id) ON DELETE SET NULL,
      CONSTRAINT fk_activation_tokens_created_by FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE SET NULL
    ) ${TABLE_OPTS}`,
  },
  {
    // Append-only, không FK: ghi 100% lần thử claim (FR-3.7) và phải sống sau khi xoá nhà/user.
    name: "create_activation_logs_table",
    sql: `CREATE TABLE IF NOT EXISTS activation_logs (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      home_id INT UNSIGNED NULL,
      user_id INT UNSIGNED NULL,
      activation_token_id BIGINT UNSIGNED NULL,
      code_hash CHAR(64) NULL,
      method ENUM('qr','code','operator_assign') NOT NULL,
      result ENUM('success','failed') NOT NULL,
      reason VARCHAR(32) NULL,
      ip_address VARCHAR(45) NULL,
      user_agent VARCHAR(255) NULL,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      PRIMARY KEY (id),
      KEY idx_activation_logs_user (user_id, created_at),
      KEY idx_activation_logs_code (code_hash, created_at),
      KEY idx_activation_logs_home (home_id)
    ) ${TABLE_OPTS}`,
  },
  {
    // Refresh token xoay vòng của Mobile; chỉ lưu sha256. family_id nhóm các token cùng một phiên
    // để thu hồi cả họ khi phát hiện dùng lại token cũ (reuse detection).
    name: "create_refresh_tokens_table",
    sql: `CREATE TABLE IF NOT EXISTS refresh_tokens (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      user_id INT UNSIGNED NOT NULL,
      token_hash CHAR(64) NOT NULL,
      family_id CHAR(36) NOT NULL,
      expires_at DATETIME NOT NULL,
      revoked_at DATETIME NULL,
      replaced_by_id BIGINT UNSIGNED NULL,
      user_agent VARCHAR(255) NULL,
      ip_address VARCHAR(45) NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_refresh_tokens_token_hash (token_hash),
      KEY idx_refresh_tokens_user (user_id),
      KEY idx_refresh_tokens_family (family_id),
      CONSTRAINT fk_refresh_tokens_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
    ) ${TABLE_OPTS}`,
  },

  // ───────────────────────── V2: lệnh thiết bị, hành vi, automation ─────────────────────────
  {
    // Device Command Log (FR-5.9). device_id có thể là gateway (restart/factory_reset).
    name: "create_device_commands_table",
    sql: `CREATE TABLE IF NOT EXISTS device_commands (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      device_id INT UNSIGNED NOT NULL,
      home_id INT UNSIGNED NULL,
      issued_by INT UNSIGNED NULL,
      source ENUM('user','automation','operator') NOT NULL,
      channel ENUM('mobile','web','dashboard','system') NOT NULL,
      command VARCHAR(32) NOT NULL,
      status ENUM('pending','sent','acked','failed','timeout') NOT NULL DEFAULT 'pending',
      error_code VARCHAR(32) NULL,
      issued_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      acked_at DATETIME(3) NULL,
      PRIMARY KEY (id),
      KEY idx_device_commands_device_status (device_id, status),
      KEY idx_device_commands_issued (issued_at),
      CONSTRAINT fk_device_commands_device FOREIGN KEY (device_id) REFERENCES devices (id) ON DELETE CASCADE,
      CONSTRAINT fk_device_commands_issued_by FOREIGN KEY (issued_by) REFERENCES users (id) ON DELETE SET NULL
    ) ${TABLE_OPTS}`,
  },
  {
    // Dữ liệu hành vi cho gợi ý thói quen (FR-7.3). weekday/minute_of_day theo múi giờ của nhà.
    // Truy vấn chỉ theo nhà (NFR-S4) nên không FK user/room/device: log sống sau khi xoá chúng.
    name: "create_user_behavior_logs_table",
    sql: `CREATE TABLE IF NOT EXISTS user_behavior_logs (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      event_id CHAR(36) NOT NULL,
      timestamp DATETIME(3) NOT NULL,
      user_id INT UNSIGNED NULL,
      smart_home_id INT UNSIGNED NOT NULL,
      room_id INT UNSIGNED NULL,
      device_id INT UNSIGNED NULL,
      device_type VARCHAR(64) NULL,
      action VARCHAR(64) NOT NULL,
      previous_state VARCHAR(128) NULL,
      new_state VARCHAR(128) NULL,
      weekday TINYINT UNSIGNED NOT NULL,
      minute_of_day SMALLINT UNSIGNED NOT NULL,
      is_weekend TINYINT(1) NOT NULL,
      is_holiday TINYINT(1) NOT NULL DEFAULT 0,
      source ENUM('manual','automation','voice','mobile','dashboard','ai_suggested') NOT NULL,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      PRIMARY KEY (id),
      UNIQUE KEY uq_user_behavior_logs_event_id (event_id),
      KEY idx_user_behavior_logs_home_time (smart_home_id, timestamp),
      KEY idx_user_behavior_logs_device_time (device_id, timestamp),
      CONSTRAINT fk_user_behavior_logs_home FOREIGN KEY (smart_home_id) REFERENCES smart_homes (id) ON DELETE CASCADE
    ) ${TABLE_OPTS}`,
  },
  {
    name: "create_automation_rules_table",
    sql: `CREATE TABLE IF NOT EXISTS automation_rules (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT,
      home_id INT UNSIGNED NOT NULL,
      name VARCHAR(128) NOT NULL,
      trigger_type ENUM('sensor_threshold','schedule') NOT NULL,
      is_enabled TINYINT(1) NOT NULL DEFAULT 1,
      condition_room_id INT UNSIGNED NULL,
      condition_sensor_type ENUM('TEMPERATURE','HUMIDITY') NULL,
      condition_operator ENUM('>','<','=') NULL,
      condition_threshold_value DECIMAL(8,2) NULL,
      schedule_time_of_day CHAR(5) NULL,
      schedule_days_of_week VARCHAR(16) NULL,
      action_device_id INT UNSIGNED NULL,
      action_command ENUM('turn_on','turn_off') NOT NULL,
      origin ENUM('user','ai_suggested') NOT NULL DEFAULT 'user',
      source_recommendation_id BIGINT UNSIGNED NULL,
      last_condition_state TINYINT(1) NULL,
      last_triggered_at DATETIME NULL,
      created_by INT UNSIGNED NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_automation_rules_home_enabled (home_id, is_enabled),
      CONSTRAINT fk_automation_rules_home FOREIGN KEY (home_id) REFERENCES smart_homes (id) ON DELETE CASCADE,
      CONSTRAINT fk_automation_rules_room FOREIGN KEY (condition_room_id) REFERENCES rooms (id) ON DELETE SET NULL,
      CONSTRAINT fk_automation_rules_device FOREIGN KEY (action_device_id) REFERENCES devices (id) ON DELETE SET NULL,
      CONSTRAINT fk_automation_rules_created_by FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE SET NULL
    ) ${TABLE_OPTS}`,
  },
  {
    name: "create_automation_history_table",
    sql: `CREATE TABLE IF NOT EXISTS automation_history (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      rule_id INT UNSIGNED NOT NULL,
      home_id INT UNSIGNED NOT NULL,
      triggered_at DATETIME(3) NOT NULL,
      result ENUM('success','failed','skipped') NOT NULL,
      details JSON NULL,
      PRIMARY KEY (id),
      KEY idx_automation_history_rule_time (rule_id, triggered_at),
      CONSTRAINT fk_automation_history_rule FOREIGN KEY (rule_id) REFERENCES automation_rules (id) ON DELETE CASCADE
    ) ${TABLE_OPTS}`,
  },
  {
    // API ánh xạ status: pending→"pending", confirmed→"accepted", rejected/expired→"dismissed".
    name: "create_recommendation_history_table",
    sql: `CREATE TABLE IF NOT EXISTS recommendation_history (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      home_id INT UNSIGNED NOT NULL,
      device_id INT UNSIGNED NULL,
      action ENUM('turn_on','turn_off') NOT NULL,
      time_of_day CHAR(5) NOT NULL,
      days_matched TINYINT UNSIGNED NOT NULL,
      window_days TINYINT UNSIGNED NOT NULL,
      suggested_rule_config JSON NOT NULL,
      status ENUM('pending','confirmed','rejected','expired') NOT NULL DEFAULT 'pending',
      presented_at DATETIME NOT NULL,
      responded_at DATETIME NULL,
      responded_by INT UNSIGNED NULL,
      created_rule_id INT UNSIGNED NULL,
      PRIMARY KEY (id),
      KEY idx_recommendation_history_home_status (home_id, status),
      CONSTRAINT fk_recommendation_history_home FOREIGN KEY (home_id) REFERENCES smart_homes (id) ON DELETE CASCADE,
      CONSTRAINT fk_recommendation_history_device FOREIGN KEY (device_id) REFERENCES devices (id) ON DELETE CASCADE
    ) ${TABLE_OPTS}`,
  },
  {
    name: "create_user_feedback_table",
    sql: `CREATE TABLE IF NOT EXISTS user_feedback (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT,
      recommendation_id BIGINT UNSIGNED NOT NULL,
      user_id INT UNSIGNED NULL,
      feedback_type ENUM('accepted','rejected','modified') NOT NULL,
      reason VARCHAR(255) NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_user_feedback_recommendation (recommendation_id),
      CONSTRAINT fk_user_feedback_recommendation FOREIGN KEY (recommendation_id) REFERENCES recommendation_history (id) ON DELETE CASCADE
    ) ${TABLE_OPTS}`,
  },

  // ───────────────────────── V2: quyền Operator, firmware, OTA ─────────────────────────
  {
    // Grant đang hiệu lực: revoked_at IS NULL AND expires_at > NOW() (FR-9.6).
    // granted_by ON DELETE CASCADE (không RESTRICT): Operator tự cấp quyền (break-glass) có
    // operator_user_id = granted_by; RESTRICT sẽ chặn việc xoá chính Operator đó.
    name: "create_operator_home_access_table",
    sql: `CREATE TABLE IF NOT EXISTS operator_home_access (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT,
      operator_user_id INT UNSIGNED NOT NULL,
      home_id INT UNSIGNED NOT NULL,
      reason VARCHAR(255) NOT NULL,
      granted_by INT UNSIGNED NOT NULL,
      expires_at DATETIME NOT NULL,
      revoked_at DATETIME NULL,
      revoked_by INT UNSIGNED NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_operator_home_access_operator_home (operator_user_id, home_id),
      KEY idx_operator_home_access_expires (expires_at),
      CONSTRAINT fk_operator_home_access_operator FOREIGN KEY (operator_user_id) REFERENCES users (id) ON DELETE CASCADE,
      CONSTRAINT fk_operator_home_access_home FOREIGN KEY (home_id) REFERENCES smart_homes (id) ON DELETE CASCADE,
      CONSTRAINT fk_operator_home_access_granted_by FOREIGN KEY (granted_by) REFERENCES users (id) ON DELETE CASCADE
    ) ${TABLE_OPTS}`,
  },
  {
    name: "create_firmware_table",
    sql: `CREATE TABLE IF NOT EXISTS firmware (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT,
      target_type ENUM('gateway','node') NOT NULL,
      version VARCHAR(32) NOT NULL,
      file_name VARCHAR(128) NOT NULL,
      size_bytes INT UNSIGNED NOT NULL,
      checksum_sha256 CHAR(64) NOT NULL,
      storage_path VARCHAR(255) NOT NULL,
      release_notes VARCHAR(500) NULL,
      is_stable TINYINT(1) NOT NULL DEFAULT 0,
      uploaded_by INT UNSIGNED NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_firmware_type_version (target_type, version),
      CONSTRAINT fk_firmware_uploaded_by FOREIGN KEY (uploaded_by) REFERENCES users (id) ON DELETE SET NULL
    ) ${TABLE_OPTS}`,
  },
  {
    name: "create_ota_jobs_table",
    sql: `CREATE TABLE IF NOT EXISTS ota_jobs (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT,
      firmware_id INT UNSIGNED NOT NULL,
      scope_type ENUM('system','home') NOT NULL,
      scope_id INT UNSIGNED NULL,
      status ENUM('running','completed','failed_partial','rolled_back') NOT NULL DEFAULT 'running',
      created_by INT UNSIGNED NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      finished_at DATETIME NULL,
      PRIMARY KEY (id),
      KEY idx_ota_jobs_status (status),
      CONSTRAINT fk_ota_jobs_firmware FOREIGN KEY (firmware_id) REFERENCES firmware (id) ON DELETE CASCADE,
      CONSTRAINT fk_ota_jobs_created_by FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE SET NULL
    ) ${TABLE_OPTS}`,
  },
  {
    name: "create_ota_history_table",
    sql: `CREATE TABLE IF NOT EXISTS ota_history (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      ota_job_id INT UNSIGNED NOT NULL,
      device_id INT UNSIGNED NOT NULL,
      status ENUM('pending','downloading','applied','failed','rolled_back') NOT NULL DEFAULT 'pending',
      progress_percent TINYINT UNSIGNED NOT NULL DEFAULT 0,
      started_at DATETIME NULL,
      finished_at DATETIME NULL,
      error_message VARCHAR(255) NULL,
      PRIMARY KEY (id),
      UNIQUE KEY uq_ota_history_job_device (ota_job_id, device_id),
      KEY idx_ota_history_device_status (device_id, status),
      CONSTRAINT fk_ota_history_job FOREIGN KEY (ota_job_id) REFERENCES ota_jobs (id) ON DELETE CASCADE,
      CONSTRAINT fk_ota_history_device FOREIGN KEY (device_id) REFERENCES devices (id) ON DELETE CASCADE
    ) ${TABLE_OPTS}`,
  },
  {
    // Retention theo thời gian (DELETE … WHERE received_at < ?) và biểu đồ 7 ngày: (device_id,
    // received_at) đã có, nhưng job dọn dẹp lọc theo received_at thuần nên cần index riêng.
    name: "add_sensor_data_received_at_index",
    sql: "ALTER TABLE sensor_data ADD KEY idx_sensor_data_received (received_at)",
  },
  {
    // Thu hồi phiên JWT stateless: token mang `tv`, lệch với cột này (đổi mật khẩu/khoá/đăng xuất) → 401.
    name: "add_token_version_to_users",
    sql: "ALTER TABLE users ADD COLUMN token_version INT UNSIGNED NOT NULL DEFAULT 0 AFTER last_login",
  },
];

// Lỗi MySQL "đối tượng đã tồn tại": DB tạo mới từ database/migrations/001_schema.sql đã có sẵn
// schema cuối cùng nên ALTER/CREATE KEY của entry tương ứng báo trùng. Coi là đã áp dụng
// (ghi vào _migrations, đi tiếp) thay vì dừng cả chuỗi như trước đây.
const ALREADY_PRESENT_ERRNO = new Set<number>([
  1050, // ER_TABLE_EXISTS_ERROR
  1060, // ER_DUP_FIELDNAME
  1061, // ER_DUP_KEYNAME
  1826, // ER_FK_DUP_NAME
]);

function isAlreadyPresentError(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const { errno } = err as { errno?: unknown };
  return typeof errno === "number" && ALREADY_PRESENT_ERRNO.has(errno);
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Áp dụng các migration chưa chạy, theo thứ tự. Dừng ở entry lỗi đầu tiên và log
 * `[migrate] FAILED <name>: <message>` — server vẫn khởi động (xem server.ts) nhưng tính năng
 * cần schema mới sẽ lỗi. Trả `true` khi mọi entry đã áp dụng/đã có sẵn.
 */
export async function runMigrations(): Promise<boolean> {
  let conn: PoolConnection | null = null;
  let current = "(setup)";
  try {
    conn = await pool.getConnection();
    // Tạo bảng theo dõi migration nếu chưa tồn tại
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS _migrations (
        name VARCHAR(128) PRIMARY KEY,
        applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    for (const m of migrations) {
      current = m.name;
      const [rows] = await conn.execute<RowDataPacket[]>(
        "SELECT name FROM _migrations WHERE name = ?",
        [m.name]
      );
      if (rows.length > 0) continue; // đã áp dụng rồi – bỏ qua

      try {
        await conn.execute(m.sql);
        console.log(`[migrate] applied: ${m.name}`);
      } catch (err) {
        if (!isAlreadyPresentError(err)) throw err;
        console.log(`[migrate] already present (schema from 001_schema.sql): ${m.name}`);
      }
      await conn.execute("INSERT INTO _migrations (name) VALUES (?)", [m.name]);
    }
    return true;
  } catch (err) {
    console.error(`[migrate] FAILED ${current}: ${errorMessage(err)}`);
    return false;
  } finally {
    conn?.release();
  }
}
