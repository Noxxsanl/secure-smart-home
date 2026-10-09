-- ============================================================
-- Secure Smart Home IoT – Database Schema
-- Migration: 001_schema.sql
--
-- Chỉ chạy khi volume MySQL Docker còn trống (docker-entrypoint-initdb.d) hoặc chạy tay
-- theo docs/11. File này mô tả SCHEMA CUỐI CÙNG (V2) cho DB mới: các bảng users/devices/
-- notifications/audit_log đã có đủ cột V2 ngay trong CREATE TABLE.
--
-- Thay đổi cho DB ĐÃ TỒN TẠI KHÔNG đưa vào đây mà thêm vào cuối mảng `migrations` trong
-- backend/src/config/migrate.ts (chạy mỗi lần backend khởi động). Khi backend khởi động trên
-- DB tạo từ file này, các migration tương ứng báo "đối tượng đã tồn tại" và được ghi nhận
-- là đã áp dụng — hai nguồn phải luôn khớp nhau.
-- Tên bảng/cột theo docs/04 §6–7 và CONTRACT_V2 §1.
-- ============================================================

CREATE DATABASE IF NOT EXISTS secure_smart_home_iot
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE secure_smart_home_iot;

-- --------------------------------------------------------
-- Table: users
-- Nhân viên (admin/operator) có username; khách hàng (user) đăng nhập bằng email nên username NULL.
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id           INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  username     VARCHAR(64)     NULL,
  email        VARCHAR(190)    NULL,
  full_name    VARCHAR(128)    NULL,
  password_hash VARCHAR(255)   NOT NULL,
  role         ENUM('admin','operator','user') NOT NULL DEFAULT 'operator',
  status       ENUM('active','locked') NOT NULL DEFAULT 'active',
  created_at   DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_login   DATETIME        NULL,
  token_version INT UNSIGNED   NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_username (username),
  UNIQUE KEY uq_users_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- Table: customers (hồ sơ khách hàng, 1-1 với users.role='user')
-- user_tag: "<slug>#<4 số>", ví dụ dat#4821 — dùng để Operator gán chủ nhà.
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS customers (
  id           INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  user_id      INT UNSIGNED    NOT NULL,
  full_name    VARCHAR(128)    NOT NULL,
  phone        VARCHAR(20)     NULL,
  address      VARCHAR(255)    NULL,
  user_tag     VARCHAR(32)     NOT NULL,
  created_at   DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_customers_user_id (user_id),
  UNIQUE KEY uq_customers_user_tag (user_tag),
  CONSTRAINT fk_customers_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- Table: smart_homes
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS smart_homes (
  id                  INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name                VARCHAR(128) NOT NULL,
  package_code        ENUM('KIT_A','KIT_B') NOT NULL,
  address             VARCHAR(255) NULL,
  expected_owner_name VARCHAR(128) NULL,
  timezone            VARCHAR(64)  NOT NULL DEFAULT 'Asia/Ho_Chi_Minh',
  status              ENUM('unclaimed','active','suspended') NOT NULL DEFAULT 'unclaimed',
  owner_user_id       INT UNSIGNED NULL,
  created_by          INT UNSIGNED NULL,
  claimed_at          DATETIME     NULL,
  created_at          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_smart_homes_status (status),
  KEY idx_smart_homes_owner (owner_user_id),
  CONSTRAINT fk_smart_homes_owner      FOREIGN KEY (owner_user_id) REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT fk_smart_homes_created_by FOREIGN KEY (created_by)    REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- Table: rooms
-- room_type: living_room|bedroom|kitchen|bathroom|office|garage|garden|door (kiểm ở tầng ứng dụng)
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS rooms (
  id           INT UNSIGNED      NOT NULL AUTO_INCREMENT,
  home_id      INT UNSIGNED      NOT NULL,
  name         VARCHAR(64)       NOT NULL,
  room_type    VARCHAR(32)       NOT NULL,
  sort_order   SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  created_at   DATETIME          NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME          NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_rooms_home (home_id),
  CONSTRAINT fk_rooms_home FOREIGN KEY (home_id) REFERENCES smart_homes (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- Table: devices
-- 1 dòng = 1 thiết bị logic. device_type giữ 'sensor'|'gateway' (danh tính cho HMAC);
-- loại chức năng nằm ở `category`. Dòng node trỏ về dòng gateway qua gateway_device_id.
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS devices (
  id           INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  device_id    VARCHAR(64)     NOT NULL,
  device_name  VARCHAR(128)    NOT NULL,
  device_type  ENUM('sensor','gateway') NOT NULL,
  secret_key   VARCHAR(64)     NOT NULL,
  status       ENUM('inactive','active','blocked') NOT NULL DEFAULT 'inactive',
  location     VARCHAR(255)    NULL,
  fail_count   TINYINT UNSIGNED NOT NULL DEFAULT 0,
  last_seen    DATETIME        NULL,
  last_ip      VARCHAR(45)     NULL,
  created_at   DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by   INT UNSIGNED    NULL,
  home_id      INT UNSIGNED    NULL,
  room_id      INT UNSIGNED    NULL,
  gateway_device_id INT UNSIGNED NULL,
  node_uid     VARCHAR(64)     NULL,
  category     ENUM('gateway','sensor','relay','camera','door_contact') NOT NULL DEFAULT 'sensor',
  power_state  TINYINT(1)      NULL,
  firmware_version VARCHAR(32) NULL,
  rssi         SMALLINT        NULL,
  wifi_ssid    VARCHAR(64)     NULL,
  provision_status ENUM('pending','provisioned') NOT NULL DEFAULT 'pending',
  is_simulated TINYINT(1)      NOT NULL DEFAULT 0,
  sim_online   TINYINT(1)      NOT NULL DEFAULT 1,
  updated_at   DATETIME        NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_devices_device_id (device_id),
  KEY idx_devices_status (status),
  KEY idx_devices_home_room (home_id, room_id),
  KEY idx_devices_gateway (gateway_device_id),
  KEY idx_devices_category (category),
  CONSTRAINT fk_devices_created_by FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT fk_devices_home    FOREIGN KEY (home_id) REFERENCES smart_homes (id) ON DELETE SET NULL,
  CONSTRAINT fk_devices_room    FOREIGN KEY (room_id) REFERENCES rooms (id) ON DELETE SET NULL,
  CONSTRAINT fk_devices_gateway FOREIGN KEY (gateway_device_id) REFERENCES devices (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- Table: sensor_data
-- Giữ theo THỜI GIAN (mặc định 8 ngày, job retention hằng giờ) để vẽ được biểu đồ 7 ngày.
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS sensor_data (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  device_id    INT UNSIGNED    NOT NULL,
  gateway_id   INT UNSIGNED    NOT NULL,
  payload      JSON            NOT NULL,
  received_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_sensor_data_device_received (device_id, received_at DESC),
  KEY idx_sensor_data_received (received_at),
  CONSTRAINT fk_sensor_data_device  FOREIGN KEY (device_id)  REFERENCES devices (id) ON DELETE CASCADE,
  CONSTRAINT fk_sensor_data_gateway FOREIGN KEY (gateway_id) REFERENCES devices (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- Table: device_tokens
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS device_tokens (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  device_id    INT UNSIGNED    NOT NULL,
  token_hash   VARCHAR(255)    NOT NULL,
  expires_at   DATETIME        NOT NULL,
  revoked      TINYINT(1)      NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  CONSTRAINT fk_device_tokens_device FOREIGN KEY (device_id) REFERENCES devices (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- Table: audit_log (kho của Log Center — FR-10.4)
-- Không FK home_id/actor_user_id: dòng log phải sống sau khi xoá nhà/người dùng.
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_log (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  event_type   VARCHAR(64)     NOT NULL,
  category     ENUM('gateway','device','provision','mqtt','security','auth','activity','automation','ota','error') NOT NULL DEFAULT 'security',
  severity     ENUM('critical','warning','info','success') NOT NULL DEFAULT 'info',
  device_id    INT UNSIGNED    NULL,
  home_id      INT UNSIGNED    NULL,
  actor_user_id INT UNSIGNED   NULL,
  message      VARCHAR(255)    NULL,
  ip_address   VARCHAR(45)     NULL,
  user_agent   VARCHAR(512)    NULL,
  details      JSON            NULL,
  created_at   DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_audit_log_event_created (event_type, created_at DESC),
  KEY idx_audit_log_category_created (category, created_at),
  KEY idx_audit_log_home_created (home_id, created_at),
  CONSTRAINT fk_audit_log_device FOREIGN KEY (device_id) REFERENCES devices (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- Table: notifications
-- Nhân viên: target_role = admin|operator|all (cờ is_read dùng chung).
-- Khách hàng: target_role = 'user', user_id = người nhận (mỗi người một dòng).
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS notifications (
  id           INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  title        VARCHAR(255)    NOT NULL,
  message      TEXT            NOT NULL,
  type         VARCHAR(64)     NOT NULL DEFAULT 'info',
  severity     ENUM('critical','warning','info','success') NOT NULL DEFAULT 'info',
  actor_id     INT UNSIGNED    NULL,
  actor_username VARCHAR(64)   NULL,
  actor_role   VARCHAR(32)     NULL,
  target_role  VARCHAR(32)     NOT NULL DEFAULT 'admin',
  related_device_id INT UNSIGNED NULL DEFAULT NULL,
  user_id      INT UNSIGNED    NULL,
  home_id      INT UNSIGNED    NULL,
  is_read      TINYINT(1)      NOT NULL DEFAULT 0,
  created_at   DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_target_is_read (target_role, is_read),
  KEY idx_created_at (created_at),
  KEY idx_notifications_user (user_id, is_read, created_at),
  CONSTRAINT fk_notifications_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_notifications_home FOREIGN KEY (home_id) REFERENCES smart_homes (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- Table: smart_home_members
-- Lời mời đang chờ: user_id NULL + invite_email NOT NULL.
-- Thành viên hiệu lực: user_id NOT NULL AND (expires_at IS NULL OR expires_at > NOW()).
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS smart_home_members (
  id                INT UNSIGNED NOT NULL AUTO_INCREMENT,
  home_id           INT UNSIGNED NOT NULL,
  user_id           INT UNSIGNED NULL,
  member_role       ENUM('OWNER','CONTROLLER','VIEWER','GUEST') NOT NULL,
  display_name      VARCHAR(128) NULL,
  invite_email      VARCHAR(190) NULL,
  invite_expires_at DATETIME     NULL,
  invited_by        INT UNSIGNED NULL,
  expires_at        DATETIME     NULL,
  accepted_at       DATETIME     NULL,
  created_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_smart_home_members_home_user (home_id, user_id),
  KEY idx_smart_home_members_user (user_id),
  KEY idx_smart_home_members_invite (invite_email),
  CONSTRAINT fk_smart_home_members_home       FOREIGN KEY (home_id)    REFERENCES smart_homes (id) ON DELETE CASCADE,
  CONSTRAINT fk_smart_home_members_user       FOREIGN KEY (user_id)    REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_smart_home_members_invited_by FOREIGN KEY (invited_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- Table: member_device_access (thiết bị GUEST được phép dùng — FR-6.3)
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS member_device_access (
  member_id    INT UNSIGNED NOT NULL,
  device_id    INT UNSIGNED NOT NULL,
  PRIMARY KEY (member_id, device_id),
  CONSTRAINT fk_member_device_access_member FOREIGN KEY (member_id) REFERENCES smart_home_members (id) ON DELETE CASCADE,
  CONSTRAINT fk_member_device_access_device FOREIGN KEY (device_id) REFERENCES devices (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- Table: activation_tokens (chỉ lưu sha256 của mã — NFR-S2)
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS activation_tokens (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  home_id         INT UNSIGNED    NOT NULL,
  code_hash       CHAR(64)        NOT NULL,
  token_type      ENUM('INITIAL_CLAIM') NOT NULL DEFAULT 'INITIAL_CLAIM',
  expires_at      DATETIME        NOT NULL,
  used_at         DATETIME        NULL,
  used_by_user_id INT UNSIGNED    NULL,
  revoked_at      DATETIME        NULL,
  revoked_by      INT UNSIGNED    NULL,
  created_by      INT UNSIGNED    NULL,
  created_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_activation_tokens_code_hash (code_hash),
  KEY idx_activation_tokens_home (home_id),
  CONSTRAINT fk_activation_tokens_home       FOREIGN KEY (home_id)         REFERENCES smart_homes (id) ON DELETE CASCADE,
  CONSTRAINT fk_activation_tokens_used_by    FOREIGN KEY (used_by_user_id) REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT fk_activation_tokens_revoked_by FOREIGN KEY (revoked_by)      REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT fk_activation_tokens_created_by FOREIGN KEY (created_by)      REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- Table: activation_logs (append-only, không FK — ghi 100% lần thử claim, FR-3.7)
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS activation_logs (
  id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  home_id             INT UNSIGNED    NULL,
  user_id             INT UNSIGNED    NULL,
  activation_token_id BIGINT UNSIGNED NULL,
  code_hash           CHAR(64)        NULL,
  method              ENUM('qr','code','operator_assign') NOT NULL,
  result              ENUM('success','failed') NOT NULL,
  reason              VARCHAR(32)     NULL,
  ip_address          VARCHAR(45)     NULL,
  user_agent          VARCHAR(255)    NULL,
  created_at          DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_activation_logs_user (user_id, created_at),
  KEY idx_activation_logs_code (code_hash, created_at),
  KEY idx_activation_logs_home (home_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- Table: refresh_tokens (Mobile, xoay vòng; chỉ lưu sha256; family_id để phát hiện dùng lại)
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id        INT UNSIGNED    NOT NULL,
  token_hash     CHAR(64)        NOT NULL,
  family_id      CHAR(36)        NOT NULL,
  expires_at     DATETIME        NOT NULL,
  revoked_at     DATETIME        NULL,
  replaced_by_id BIGINT UNSIGNED NULL,
  user_agent     VARCHAR(255)    NULL,
  ip_address     VARCHAR(45)     NULL,
  created_at     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_refresh_tokens_token_hash (token_hash),
  KEY idx_refresh_tokens_user (user_id),
  KEY idx_refresh_tokens_family (family_id),
  CONSTRAINT fk_refresh_tokens_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- Table: device_commands (Device Command Log — FR-5.9; device_id có thể là gateway)
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS device_commands (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  device_id   INT UNSIGNED    NOT NULL,
  home_id     INT UNSIGNED    NULL,
  issued_by   INT UNSIGNED    NULL,
  source      ENUM('user','automation','operator') NOT NULL,
  channel     ENUM('mobile','web','dashboard','system') NOT NULL,
  command     VARCHAR(32)     NOT NULL,
  status      ENUM('pending','sent','acked','failed','timeout') NOT NULL DEFAULT 'pending',
  error_code  VARCHAR(32)     NULL,
  issued_at   DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  acked_at    DATETIME(3)     NULL,
  PRIMARY KEY (id),
  KEY idx_device_commands_device_status (device_id, status),
  KEY idx_device_commands_issued (issued_at),
  CONSTRAINT fk_device_commands_device    FOREIGN KEY (device_id) REFERENCES devices (id) ON DELETE CASCADE,
  CONSTRAINT fk_device_commands_issued_by FOREIGN KEY (issued_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- Table: user_behavior_logs (FR-7.3, NFR-S4 — truy vấn chỉ theo nhà; weekday/minute theo múi giờ nhà)
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_behavior_logs (
  id             BIGINT UNSIGNED   NOT NULL AUTO_INCREMENT,
  event_id       CHAR(36)          NOT NULL,
  timestamp      DATETIME(3)       NOT NULL,
  user_id        INT UNSIGNED      NULL,
  smart_home_id  INT UNSIGNED      NOT NULL,
  room_id        INT UNSIGNED      NULL,
  device_id      INT UNSIGNED      NULL,
  device_type    VARCHAR(64)       NULL,
  action         VARCHAR(64)       NOT NULL,
  previous_state VARCHAR(128)      NULL,
  new_state      VARCHAR(128)      NULL,
  weekday        TINYINT UNSIGNED  NOT NULL,
  minute_of_day  SMALLINT UNSIGNED NOT NULL,
  is_weekend     TINYINT(1)        NOT NULL,
  is_holiday     TINYINT(1)        NOT NULL DEFAULT 0,
  source         ENUM('manual','automation','voice','mobile','dashboard','ai_suggested') NOT NULL,
  created_at     DATETIME(3)       NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_user_behavior_logs_event_id (event_id),
  KEY idx_user_behavior_logs_home_time (smart_home_id, timestamp),
  KEY idx_user_behavior_logs_device_time (device_id, timestamp),
  CONSTRAINT fk_user_behavior_logs_home FOREIGN KEY (smart_home_id) REFERENCES smart_homes (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- Table: automation_rules (FR-7.1)
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS automation_rules (
  id                        INT UNSIGNED NOT NULL AUTO_INCREMENT,
  home_id                   INT UNSIGNED NOT NULL,
  name                      VARCHAR(128) NOT NULL,
  trigger_type              ENUM('sensor_threshold','schedule') NOT NULL,
  is_enabled                TINYINT(1)   NOT NULL DEFAULT 1,
  condition_room_id         INT UNSIGNED NULL,
  condition_sensor_type     ENUM('TEMPERATURE','HUMIDITY') NULL,
  condition_operator        ENUM('>','<','=') NULL,
  condition_threshold_value DECIMAL(8,2) NULL,
  schedule_time_of_day      CHAR(5)      NULL,
  schedule_days_of_week     VARCHAR(16)  NULL,
  action_device_id          INT UNSIGNED NULL,
  action_command            ENUM('turn_on','turn_off') NOT NULL,
  origin                    ENUM('user','ai_suggested') NOT NULL DEFAULT 'user',
  source_recommendation_id  BIGINT UNSIGNED NULL,
  last_condition_state      TINYINT(1)   NULL,
  last_triggered_at         DATETIME     NULL,
  created_by                INT UNSIGNED NULL,
  created_at                DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at                DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_automation_rules_home_enabled (home_id, is_enabled),
  CONSTRAINT fk_automation_rules_home       FOREIGN KEY (home_id)           REFERENCES smart_homes (id) ON DELETE CASCADE,
  CONSTRAINT fk_automation_rules_room       FOREIGN KEY (condition_room_id) REFERENCES rooms (id) ON DELETE SET NULL,
  CONSTRAINT fk_automation_rules_device     FOREIGN KEY (action_device_id)  REFERENCES devices (id) ON DELETE SET NULL,
  CONSTRAINT fk_automation_rules_created_by FOREIGN KEY (created_by)        REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- Table: automation_history (FR-7.2)
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS automation_history (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  rule_id      INT UNSIGNED    NOT NULL,
  home_id      INT UNSIGNED    NOT NULL,
  triggered_at DATETIME(3)     NOT NULL,
  result       ENUM('success','failed','skipped') NOT NULL,
  details      JSON            NULL,
  PRIMARY KEY (id),
  KEY idx_automation_history_rule_time (rule_id, triggered_at),
  CONSTRAINT fk_automation_history_rule FOREIGN KEY (rule_id) REFERENCES automation_rules (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- Table: recommendation_history (gợi ý thói quen — FR-7.4..7.7)
-- API: pending→"pending", confirmed→"accepted", rejected/expired→"dismissed"
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS recommendation_history (
  id                    BIGINT UNSIGNED  NOT NULL AUTO_INCREMENT,
  home_id               INT UNSIGNED     NOT NULL,
  device_id             INT UNSIGNED     NULL,
  action                ENUM('turn_on','turn_off') NOT NULL,
  time_of_day           CHAR(5)          NOT NULL,
  days_matched          TINYINT UNSIGNED NOT NULL,
  window_days           TINYINT UNSIGNED NOT NULL,
  suggested_rule_config JSON             NOT NULL,
  status                ENUM('pending','confirmed','rejected','expired') NOT NULL DEFAULT 'pending',
  presented_at          DATETIME         NOT NULL,
  responded_at          DATETIME         NULL,
  responded_by          INT UNSIGNED     NULL,
  created_rule_id       INT UNSIGNED     NULL,
  PRIMARY KEY (id),
  KEY idx_recommendation_history_home_status (home_id, status),
  CONSTRAINT fk_recommendation_history_home   FOREIGN KEY (home_id)   REFERENCES smart_homes (id) ON DELETE CASCADE,
  CONSTRAINT fk_recommendation_history_device FOREIGN KEY (device_id) REFERENCES devices (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- Table: user_feedback (FR-7.6)
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_feedback (
  id                INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  recommendation_id BIGINT UNSIGNED NOT NULL,
  user_id           INT UNSIGNED    NULL,
  feedback_type     ENUM('accepted','rejected','modified') NOT NULL,
  reason            VARCHAR(255)    NULL,
  created_at        DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_user_feedback_recommendation (recommendation_id),
  CONSTRAINT fk_user_feedback_recommendation FOREIGN KEY (recommendation_id) REFERENCES recommendation_history (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- Table: operator_home_access (FR-9.6; grant hiệu lực: revoked_at IS NULL AND expires_at > NOW())
-- granted_by ON DELETE CASCADE: Operator tự cấp quyền (break-glass) có operator_user_id = granted_by,
-- RESTRICT sẽ chặn việc xoá chính Operator đó.
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS operator_home_access (
  id               INT UNSIGNED NOT NULL AUTO_INCREMENT,
  operator_user_id INT UNSIGNED NOT NULL,
  home_id          INT UNSIGNED NOT NULL,
  reason           VARCHAR(255) NOT NULL,
  granted_by       INT UNSIGNED NOT NULL,
  expires_at       DATETIME     NOT NULL,
  revoked_at       DATETIME     NULL,
  revoked_by       INT UNSIGNED NULL,
  created_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_operator_home_access_operator_home (operator_user_id, home_id),
  KEY idx_operator_home_access_expires (expires_at),
  CONSTRAINT fk_operator_home_access_operator   FOREIGN KEY (operator_user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_operator_home_access_home       FOREIGN KEY (home_id)          REFERENCES smart_homes (id) ON DELETE CASCADE,
  CONSTRAINT fk_operator_home_access_granted_by FOREIGN KEY (granted_by)       REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- Table: firmware (FR-9.3)
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS firmware (
  id              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  target_type     ENUM('gateway','node') NOT NULL,
  version         VARCHAR(32)  NOT NULL,
  file_name       VARCHAR(128) NOT NULL,
  size_bytes      INT UNSIGNED NOT NULL,
  checksum_sha256 CHAR(64)     NOT NULL,
  storage_path    VARCHAR(255) NOT NULL,
  release_notes   VARCHAR(500) NULL,
  is_stable       TINYINT(1)   NOT NULL DEFAULT 0,
  uploaded_by     INT UNSIGNED NULL,
  created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_firmware_type_version (target_type, version),
  CONSTRAINT fk_firmware_uploaded_by FOREIGN KEY (uploaded_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- Table: ota_jobs (FR-9.4)
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS ota_jobs (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  firmware_id INT UNSIGNED NOT NULL,
  scope_type  ENUM('system','home') NOT NULL,
  scope_id    INT UNSIGNED NULL,
  status      ENUM('running','completed','failed_partial','rolled_back') NOT NULL DEFAULT 'running',
  created_by  INT UNSIGNED NULL,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finished_at DATETIME     NULL,
  PRIMARY KEY (id),
  KEY idx_ota_jobs_status (status),
  CONSTRAINT fk_ota_jobs_firmware   FOREIGN KEY (firmware_id) REFERENCES firmware (id) ON DELETE CASCADE,
  CONSTRAINT fk_ota_jobs_created_by FOREIGN KEY (created_by)  REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- Table: ota_history
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS ota_history (
  id               BIGINT UNSIGNED  NOT NULL AUTO_INCREMENT,
  ota_job_id       INT UNSIGNED     NOT NULL,
  device_id        INT UNSIGNED     NOT NULL,
  status           ENUM('pending','downloading','applied','failed','rolled_back') NOT NULL DEFAULT 'pending',
  progress_percent TINYINT UNSIGNED NOT NULL DEFAULT 0,
  started_at       DATETIME         NULL,
  finished_at      DATETIME         NULL,
  error_message    VARCHAR(255)     NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_ota_history_job_device (ota_job_id, device_id),
  KEY idx_ota_history_device_status (device_id, status),
  CONSTRAINT fk_ota_history_job    FOREIGN KEY (ota_job_id) REFERENCES ota_jobs (id) ON DELETE CASCADE,
  CONSTRAINT fk_ota_history_device FOREIGN KEY (device_id)  REFERENCES devices (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- Seed: admin user
-- password: admin123  (bcrypt cost 12)
-- Tài khoản demo khác (operator01/02, khách hàng, nhà mẫu) do backend seed khi SEED_DEMO_DATA=true.
-- --------------------------------------------------------
INSERT IGNORE INTO users (username, password_hash, role)
VALUES (
  'admin',
  '$2b$12$IbNzJkN3mOznQ4rNb9zjAOcrrfWfvqHMHYoaUKnCsCk0FdQPYetze',
  'admin'
);
