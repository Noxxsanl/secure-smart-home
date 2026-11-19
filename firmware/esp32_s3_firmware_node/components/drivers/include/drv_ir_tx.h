/*
 * Phát hồng ngoại 940 nm bằng RMT, sóng mang 38 kHz (mặc định) duty 33%.
 *
 * LED IR cần ~100 mA xung để phát xa → nối qua transistor/MOSFET, KHÔNG nối thẳng GPIO (tối đa ~40 mA).
 * Mạch NPN/MOSFET kéo xuống (GPIO mức cao = LED sáng): invert_out = false.
 *
 * Định dạng chung: chuỗi thời lượng µs xen kẽ mark/space, bắt đầu bằng mark (drv_ir_nec.h).
 */
#pragma once

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

#include "esp_err.h"

#ifdef __cplusplus
extern "C" {
#endif

#define DRV_IR_TX_MAX_DURATIONS 1024   /* đủ cho mã điều hoà dài (~600 phần tử) */

typedef struct {
    int gpio;
    bool invert_out;              /* true nếu mạch kích LED mức thấp */
    uint32_t default_carrier_hz;  /* 0 = 38000 */
    uint8_t duty_pct;             /* 0 = 33 */
} drv_ir_tx_config_t;

typedef struct drv_ir_tx *drv_ir_tx_handle_t;

esp_err_t drv_ir_tx_init(const drv_ir_tx_config_t *cfg, drv_ir_tx_handle_t *out);

/**
 * Phát chuỗi mark/space. carrier_hz = 0 → dùng default_carrier_hz. Chặn tới khi phát xong hoặc hết timeout.
 * Thời lượng > 32767 µs bị cắt (giới hạn 15 bit của RMT ở độ phân giải 1 MHz).
 */
esp_err_t drv_ir_tx_send_raw(drv_ir_tx_handle_t h, const uint16_t *durations_us, size_t count, uint32_t carrier_hz,
                             uint32_t timeout_ms);

esp_err_t drv_ir_tx_send_nec(drv_ir_tx_handle_t h, uint16_t address, uint8_t command, uint32_t timeout_ms);

esp_err_t drv_ir_tx_del(drv_ir_tx_handle_t h);

#ifdef __cplusplus
}
#endif
