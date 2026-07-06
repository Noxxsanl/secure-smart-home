-- ============================================================
-- IoT Device Manager – Database Schema
-- Migration: 001_schema.sql
-- ============================================================

CREATE DATABASE IF NOT EXISTS iot_managerDeviceIoT
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE iot_managerDeviceIoT;

-- --------------------------------------------------------
-- Table: users
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id           INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  username     VARCHAR(64)     NOT NULL,
  password_hash VARCHAR(255)   NOT NULL,
  role         ENUM('admin','operator') NOT NULL DEFAULT 'operator',
  created_at   DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_login   DATETIME        NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_username (username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- Table: devices
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
  PRIMARY KEY (id),
  UNIQUE KEY uq_devices_device_id (device_id),
  KEY idx_devices_status (status),
  CONSTRAINT fk_devices_created_by FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- Table: sensor_data
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS sensor_data (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  device_id    INT UNSIGNED    NOT NULL,
  gateway_id   INT UNSIGNED    NOT NULL,
  payload      JSON            NOT NULL,
  received_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_sensor_data_device_received (device_id, received_at DESC),
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
-- Table: audit_log
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_log (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  event_type   VARCHAR(64)     NOT NULL,
  device_id    INT UNSIGNED    NULL,
  ip_address   VARCHAR(45)     NULL,
  user_agent   VARCHAR(512)    NULL,
  details      JSON            NULL,
  created_at   DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_audit_log_event_created (event_type, created_at DESC),
  CONSTRAINT fk_audit_log_device FOREIGN KEY (device_id) REFERENCES devices (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- Seed: admin user
-- password: admin123  (bcrypt cost 12)
-- --------------------------------------------------------
INSERT IGNORE INTO users (username, password_hash, role)
VALUES (
  'admin',
  '$2b$12$IbNzJkN3mOznQ4rNb9zjAOcrrfWfvqHMHYoaUKnCsCk0FdQPYetze',
  'admin'
);
