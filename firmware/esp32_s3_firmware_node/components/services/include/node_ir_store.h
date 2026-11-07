/*
 * Kho mã IR đã học (namespace NVS "ir_codes"). Mỗi mã = sóng mang + chuỗi mark/space µs, cùng định dạng
 * với drv_ir_tx_send_raw / drv_ir_rx_receive (tầng application chuyển qua lại, services không biết driver).
 *
 * Tên mã là khoá NVS: [a-z0-9_], 1..15 ký tự (VD "ac_on", "tv_power"). Mã điều hoà ~600 phần tử ≈ 1,2 KB.
 */
#pragma once

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

#include "esp_err.h"

#ifdef __cplusplus
extern "C" {
#endif

#define NODE_IR_NAME_MAX 15
#define NODE_IR_MAX_DURATIONS 1024

bool node_ir_store_valid_name(const char *name);

esp_err_t node_ir_store_save(const char *name, uint32_t carrier_hz, const uint16_t *durations_us, size_t count);

/** ESP_ERR_NOT_FOUND nếu chưa học; ESP_ERR_INVALID_SIZE nếu `cap` nhỏ hơn mã đã lưu. */
esp_err_t node_ir_store_load(const char *name, uint32_t *carrier_hz, uint16_t *durations_us, size_t cap,
                             size_t *count);

esp_err_t node_ir_store_erase(const char *name);

#ifdef __cplusplus
}
#endif
