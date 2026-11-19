/*
 * node_state_store — trạng thái tải giữ qua mất điện (namespace NVS "loads"; services không biết relay/động cơ):
 *
 *   lamp, fan     u8   0/1 — trạng thái relay lần cuối, khôi phục khi có điện lại (menuconfig "Node S3: ứng dụng")
 *   cur_pos       i32  vị trí rèm (nửa bước, 0 = đóng hẳn)
 *   cur_travel    i32  hành trình rèm đã hiệu chuẩn (nửa bước từ đóng hẳn tới mở hẳn)
 *
 * Khoá: [a-z0-9_], 1..15 ký tự (giới hạn NVS). Cần nvs_flash_init() trước. Mỗi lần ghi có commit; tầng trên tự tránh
 * ghi lặp giá trị cũ (đỡ mòn flash).
 */
#pragma once

#include <stdint.h>

#include "esp_err.h"

#ifdef __cplusplus
extern "C" {
#endif

/** ESP_ERR_NOT_FOUND nếu chưa từng lưu. */
esp_err_t node_state_get_u8(const char *key, uint8_t *out);
esp_err_t node_state_set_u8(const char *key, uint8_t value);

/** ESP_ERR_NOT_FOUND nếu chưa từng lưu. */
esp_err_t node_state_get_i32(const char *key, int32_t *out);
esp_err_t node_state_set_i32(const char *key, int32_t value);

#ifdef __cplusplus
}
#endif
