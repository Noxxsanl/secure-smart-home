/*
 * node_app — luồng chính của Node phòng khách (như gw_app của Gateway).
 *
 *   NVS → màn hình (board_display + node_ui) → cấu hình (node_config) → ESP-NOW tới Gateway (node_link)
 *   task climate: SHT31 2 s/lần → màn hình; mỗi CONFIG_NODE_APP_TELEMETRY_INTERVAL_S → TELEMETRY có HMAC
 *                 {temperature, humidity} → Gateway (hiện ở trang Phòng khách, chuyển tiếp lên Server).
 *
 * Chưa cấp phát (NVS thiếu identity) hoặc chưa ghép nối (thiếu MAC Gateway / LMK): màn hình và cảm biến vẫn chạy,
 * góc phải màn hình báo "Chưa ghép nối Gateway".
 *
 * Điều hòa (node_ac): học mã remote bằng VS1838B, phát lại bằng LED IR — điều khiển trên màn hình (chạm ô Điều hòa)
 * hoặc từ Server (CMD có params.target = "ac"). Trạng thái gửi kèm telemetry: ac (0/1), ac_temp (°C).
 * Đèn/quạt/rèm: chưa có relay nên CMD tới chúng trả lỗi.
 */
#pragma once

#include "esp_err.h"

#ifdef __cplusplus
extern "C" {
#endif

/** Gọi 1 lần từ app_main. */
esp_err_t node_app_start(void);

#ifdef __cplusplus
}
#endif
