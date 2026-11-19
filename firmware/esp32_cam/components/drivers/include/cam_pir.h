/*
 * Cảm biến chuyển động PIR (HC-SR501) — ngắt cạnh lên, có thời gian khởi động và khoảng nghỉ giữa 2 sự kiện.
 * Gọi SAU cam_camera_init(): driver camera tự cài GPIO ISR service với cờ riêng.
 */
#pragma once

#include "esp_err.h"

typedef void (*cam_pir_motion_cb_t)(void);

esp_err_t cam_pir_start(cam_pir_motion_cb_t on_motion);
