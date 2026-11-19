/*
 * TJpgDec trong ROM ESP32-S3 dưới tên riêng — header nội bộ của tầng ui.
 *
 * Khi bộ giải nén mặc định là esp_new_jpeg (CONFIG_GW_UI_JPEG_TJPGD tắt), gw_jpeg_tjpgd.c vẫn được biên dịch với các tên
 * dưới đây để gw_jpeg_esp.c dùng làm đường lui LÚC CHẠY: khung nào esp_new_jpeg không giải được thì giải bằng ROM, và nếu
 * esp_new_jpeg chưa từng giải được khung nào sau nhiều lần thử thì chuyển hẳn sang ROM. Cùng hợp đồng với gw_jpeg.h.
 * Khi CONFIG_GW_UI_JPEG_TJPGD bật, gw_jpeg_tjpgd.c cài thẳng API gw_jpeg_* và header này không dùng.
 */
#pragma once

#include <stddef.h>
#include <stdint.h>

#include "esp_err.h"

typedef struct gw_jpeg_tjpgd gw_jpeg_tjpgd_t;

gw_jpeg_tjpgd_t *gw_jpeg_tjpgd_create(void);
void gw_jpeg_tjpgd_destroy(gw_jpeg_tjpgd_t *dec);
esp_err_t gw_jpeg_tjpgd_decode_fit(gw_jpeg_tjpgd_t *dec, const uint8_t *jpeg, size_t len, uint16_t *dst,
                                   uint16_t max_w, uint16_t max_h, uint16_t *out_w, uint16_t *out_h);
