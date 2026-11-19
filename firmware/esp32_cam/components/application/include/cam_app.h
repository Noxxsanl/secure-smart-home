/*
 * Ứng dụng camera cửa — khởi tạo mọi tầng theo đúng thứ tự và nối sự kiện:
 *
 *   PIR ──► ESP-NOW EVENT {motion} ──► chụp SVGA ──► POST /local/camera/snapshot (Gateway, Local AP)
 *   Gateway ──ESP-NOW CMD {snapshot}──► chụp ──► POST … (X-Command-Id) ──► ESP-NOW CMD_ACK
 *   Gateway ──GET /stream (HMAC)──► MJPEG VGA/QVGA, 1 kết nối
 */
#pragma once

#include "esp_err.h"

/** Gọi 1 lần từ app_main. Trả lỗi nếu camera chưa được cấp phát (NVS) hoặc phần cứng hỏng. */
esp_err_t cam_app_start(void);
