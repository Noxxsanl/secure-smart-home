/*
 * Relay HF46F (cuộn 5 V / 12 V, tiếp điểm 10 A) — điều khiển qua GPIO.
 *
 * Cuộn HF46F 5 V ăn ~40 mA → KHÔNG nối thẳng GPIO: dùng transistor NPN / MOSFET (hoặc opto PC817) +
 * diode dập 1N4148 song song cuộn, điện trở kéo xuống ở cực B/G để relay nhả khi ESP32 đang khởi động.
 *
 * An toàn:
 *   - Mọi kênh TẮT khi init; mức chân được đặt trước khi bật chế độ output (không nháy lúc khởi động).
 *   - Chặn đóng/cắt nhanh hơn `min_switch_interval_ms` (bảo vệ tiếp điểm, chống lệnh dồn dập).
 *   - drv_relay_all_off() bỏ qua giới hạn trên — dùng khi lỗi / khẩn cấp.
 */
#pragma once

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

#include "esp_err.h"

#ifdef __cplusplus
extern "C" {
#endif

#define DRV_RELAY_MAX_CHANNELS 8

typedef struct {
    int gpio;
    bool active_high;   /* NPN/MOSFET kéo xuống: true; module relay kích mức thấp: false */
} drv_relay_channel_t;

typedef struct {
    const drv_relay_channel_t *channels;
    size_t count;
    uint32_t min_switch_interval_ms;   /* 0 = 200 ms */
} drv_relay_config_t;

typedef struct drv_relay *drv_relay_handle_t;

esp_err_t drv_relay_init(const drv_relay_config_t *cfg, drv_relay_handle_t *out);

/** ESP_ERR_INVALID_STATE nếu kênh vừa đổi trạng thái chưa đủ min_switch_interval_ms. Đặt lại cùng trạng thái = OK. */
esp_err_t drv_relay_set(drv_relay_handle_t h, size_t ch, bool on);

esp_err_t drv_relay_toggle(drv_relay_handle_t h, size_t ch, bool *new_state);

esp_err_t drv_relay_get(drv_relay_handle_t h, size_t ch, bool *on);

esp_err_t drv_relay_all_off(drv_relay_handle_t h);

size_t drv_relay_count(drv_relay_handle_t h);

/** Tắt hết rồi giải phóng. */
esp_err_t drv_relay_del(drv_relay_handle_t h);

#ifdef __cplusplus
}
#endif
