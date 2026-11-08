/*
 * gw_jpeg — giải nén JPEG của Camera (OV2640: baseline, 4:2:2) thành điểm ảnh RGB565 của LVGL (LV_COLOR_DEPTH 16,
 * không đảo byte) bằng TJpgDec có sẵn trong ROM ESP32-S3 — cùng bộ giải mã esp32-camera/esp_jpeg dùng, không thêm
 * thư viện, không tốn flash. ESP32-S3 không có bộ giải mã JPEG phần cứng (IOT_NODE_NETWORK §5.4).
 *
 * Header riêng của tầng ui. Mỗi gw_jpeg_decoder_t chỉ dùng ở 1 task tại một thời điểm.
 */
#pragma once

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

#include "esp_err.h"

#define GW_JPEG_WORK_SIZE 3100   /* vùng làm việc TJpgDec R0.01 (bảng Huffman, IDCT) — như esp32-camera */

typedef struct {
    uint8_t work[GW_JPEG_WORK_SIZE] __attribute__((aligned(4)));
} gw_jpeg_decoder_t;

/**
 * Giải nén vào dst (tối đa max_w × max_h điểm ảnh). Tự thu nhỏ 1, 1/2, 1/4, 1/8 cho vừa; allow_2x: ảnh nhỏ hơn
 * một nửa khung (VD QVGA trong khung VGA) thì phóng ×2 bằng cách lặp điểm ảnh.
 * Ảnh ra nằm liền trong dst, mỗi dòng out_w điểm (dùng thẳng làm lv_img_dsc_t.data).
 *
 * ESP_ERR_INVALID_SIZE: ảnh quá lớn kể cả khi thu 1/8 · ESP_ERR_NOT_SUPPORTED / ESP_FAIL: không phải JPEG
 * baseline hoặc dữ liệu hỏng (dst có thể đã bị ghi một phần).
 */
esp_err_t gw_jpeg_decode_rgb565(gw_jpeg_decoder_t *dec, const uint8_t *jpeg, size_t len, uint16_t *dst,
                                uint16_t max_w, uint16_t max_h, bool allow_2x, uint16_t *out_w, uint16_t *out_h);
