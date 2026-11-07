/*
 * Driver camera OV2640 trên ESP32-CAM AI-Thinker (component espressif/esp32-camera).
 *
 * - Mặc định SVGA 800×600 cho ảnh chụp (IOT_NODE_NETWORK §4.2). Bộ đệm khung cấp theo SVGA, nên luồng chỉ
 *   được chọn kích thước NHỎ HƠN hoặc bằng (VGA, QVGA).
 * - Khi luồng đang chạy, ảnh chụp lấy luôn khung của luồng (không đổi độ phân giải giữa chừng — §5.4).
 */
#pragma once

#include <stddef.h>
#include <stdint.h>
#include "esp_camera.h"
#include "esp_err.h"

esp_err_t cam_camera_init(int jpeg_quality);

/**
 * Chụp 1 khung và chép JPEG vào `dst` (để trả khung về driver ngay, không giữ bộ đệm khi gửi mạng).
 * ESP_ERR_INVALID_SIZE nếu ảnh > cap.
 */
esp_err_t cam_camera_capture_copy(uint8_t *dst, size_t cap, size_t *out_len);

/** Chuyển sang kích thước/chất lượng của luồng. Gọi đúng 1 lần trước vòng lặp phát. */
esp_err_t cam_camera_stream_begin(framesize_t size, int quality);

/** Trả về cấu hình chụp ảnh mặc định. */
void cam_camera_stream_end(void);

/** Lấy/trả khung cho vòng lặp luồng MJPEG. */
camera_fb_t *cam_camera_fb_get(void);
void cam_camera_fb_return(camera_fb_t *fb);
