/*
 * gw_jpeg — giải nén JPEG của Camera (OV2640: baseline, 4:2:2) thẳng ra RGB565 của LVGL (LV_COLOR_DEPTH 16, không đảo
 * byte: 2 byte/điểm, byte thấp trước = JPEG_PIXEL_FORMAT_RGB565_LE của esp_new_jpeg). ESP32-S3 không có bộ giải mã JPEG
 * phần cứng (IOT_NODE_NETWORK §5.4). Hai bản cài đặt, chọn bằng menuconfig "Gateway S3: ui":
 *
 *   gw_jpeg_esp.c    esp_new_jpeg (mặc định) — bộ giải mã có tối ưu cho ESP32-S3, xuất RGB565 trực tiếp và tự thu nhỏ
 *                    (scale, cạnh ra là bội của 8, tối đa 1/8) nên VGA 640x480 → ô 448x336 (= 56x42 khối 8) không cần
 *                    bước co giãn riêng. Ảnh nhỏ hơn ô (QVGA) hoặc cỡ lạ thì giải nén nguyên kích thước vào bộ đệm
 *                    phụ (PSRAM) rồi co/giãn điểm gần nhất.
 *   gw_jpeg_tjpgd.c  [dự phòng] TJpgDec trong ROM, RGB888→RGB565 từng điểm — chậm hơn nhiều (đo: VGA ≈ 3,3 khung/s).
 *
 * Co giãn cho vừa khung, giữ tỉ lệ. Mỗi gw_jpeg_decoder_t chỉ dùng ở 1 task tại một thời điểm.
 */
#pragma once

#include <stddef.h>
#include <stdint.h>

#include "esp_err.h"

#ifdef __cplusplus
extern "C" {
#endif

typedef struct gw_jpeg_decoder gw_jpeg_decoder_t;

/** NULL nếu hết bộ nhớ. */
gw_jpeg_decoder_t *gw_jpeg_create(void);
void gw_jpeg_destroy(gw_jpeg_decoder_t *dec);

/**
 * Giải nén và co giãn cho vừa max_w × max_h, giữ tỉ lệ. dst phải chứa được max_w × max_h điểm ảnh VÀ căn 16 byte; ảnh ra
 * nằm liền trong dst, mỗi dòng out_w điểm (dùng thẳng làm lv_img_dsc_t.data).
 *
 * ESP_ERR_NOT_SUPPORTED: không phải JPEG baseline. ESP_FAIL: dữ liệu hỏng (dst có thể đã bị ghi một phần).
 */
esp_err_t gw_jpeg_decode_fit(gw_jpeg_decoder_t *dec, const uint8_t *jpeg, size_t len, uint16_t *dst, uint16_t max_w,
                             uint16_t max_h, uint16_t *out_w, uint16_t *out_h);

#ifdef __cplusplus
}
#endif
