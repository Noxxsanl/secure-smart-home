/*
 * Cấu hình camera đọc từ NVS (Firmware §16). Giai đoạn dev nạp bằng nvs_dev.csv (gitignore) — xem README.
 *
 *   identity/device_uuid   device_id của camera trên backend
 *   identity/device_secret secret camera (backend trả 1 lần lúc tạo — bất biến 1)
 *   wifi/ssid, wifi/password   Local AP của Gateway (KHÔNG phải WiFi thật của nhà — FR-4.6)
 *   pairing/gateway_mac    MAC Station của Gateway, "AA:BB:CC:DD:EE:FF"
 *   pairing/session_key    LMK ESP-NOW 16 byte = 32 ký tự hex (sau này cấp qua ghép nối ECDH)
 *
 * Không log password/secret/session_key (bất biến 2).
 */
#pragma once

#include <stdbool.h>
#include <stdint.h>
#include "esp_err.h"

#define CAM_DEVICE_ID_MAX 64
#define CAM_SECRET_MAX 128
#define CAM_LMK_LEN 16

typedef struct {
    char device_id[CAM_DEVICE_ID_MAX + 1];
    char device_secret[CAM_SECRET_MAX + 1];
    char wifi_ssid[33];
    char wifi_password[65];
    uint8_t gateway_mac[6];
    bool has_gateway_mac;
    uint8_t lmk[CAM_LMK_LEN];
    bool has_lmk;
} cam_config_t;

/**
 * Đọc toàn bộ cấu hình. Trả ESP_ERR_NOT_FOUND nếu thiếu identity hoặc wifi (camera chưa được cấp phát);
 * thiếu pairing chỉ là cảnh báo (ESP-NOW tắt).
 */
esp_err_t cam_config_load(cam_config_t *out);
