/*
 * HTTP server trên camera: GET /stream?fs=vga|qvga&q=10..30 (API_DESIGN §10.3, IOT_NODE_NETWORK §5.4).
 *
 *   Header X-Device-Id, X-Timestamp, X-Signature — Gateway ký bằng secret của camera, cửa sổ ±300 s.
 *   200 multipart/x-mixed-replace (mỗi phần 1 khung JPEG) · 400 tham số sai · 401 sai HMAC
 *   409 đã có 1 luồng · 503 camera chưa có giờ (chưa nhận TIME_SYNC).
 *
 * Chỉ 1 luồng cùng lúc; luồng chạy ở task riêng (httpd async) để server vẫn trả được 409.
 */
#pragma once

#include "cam_config.h"
#include "esp_err.h"

esp_err_t cam_stream_start(const cam_config_t *cfg);
