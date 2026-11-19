/*
 * Cấu hình node đọc từ NVS (Firmware §16). Giai đoạn dev nạp bằng nvs_dev.csv (gitignore) — xem README.
 *
 *   identity/device_uuid    device_id của node trên backend
 *   identity/device_secret  secret node (backend trả 1 lần lúc tạo — bất biến 1)
 *   pairing/gateway_mac     MAC Station của Gateway, "AA:BB:CC:DD:EE:FF"
 *   pairing/session_key     LMK ESP-NOW 16 byte = 32 ký tự hex (sau này cấp qua ghép nối ECDH)
 *   pairing/channel         kênh WiFi tìm được lần trước (u8, firmware tự ghi)
 *
 * Node KHÔNG có WiFi thật của nhà (IOT_NODE_NETWORK §4.1). Không log secret/session_key (bất biến 2).
 */
#pragma once

#include <stdbool.h>
#include <stdint.h>

#include "esp_err.h"

#ifdef __cplusplus
extern "C" {
#endif

#define NODE_DEVICE_ID_MAX 64
#define NODE_SECRET_MAX 128
#define NODE_LMK_LEN 16

typedef struct {
    char device_id[NODE_DEVICE_ID_MAX + 1];
    char device_secret[NODE_SECRET_MAX + 1];
    uint8_t gateway_mac[6];
    bool has_gateway_mac;
    uint8_t lmk[NODE_LMK_LEN];
    bool has_lmk;
    uint8_t channel;   /* 0 = chưa biết → dò 1..13 */
} node_config_t;

/**
 * Cần nvs_flash_init() trước. ESP_ERR_NOT_FOUND nếu thiếu identity (node chưa được cấp phát);
 * thiếu pairing chỉ là cảnh báo (ESP-NOW không chạy được).
 */
esp_err_t node_config_load(node_config_t *out);

/** Ghi lại kênh tìm được để lần khởi động sau thử kênh đó trước. */
esp_err_t node_config_save_channel(uint8_t channel);

/** Xoá MAC Gateway, LMK, kênh (khôi phục ghép nối / đổi Gateway). Identity giữ nguyên. */
esp_err_t node_config_erase_pairing(void);

/** Xoá secret và LMK khỏi bản sao trong RAM khi không cần nữa. */
void node_config_wipe(node_config_t *cfg);

#ifdef __cplusplus
}
#endif
