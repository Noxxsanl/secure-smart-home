/*
 * node_app — luồng chính của Node phòng khách (như gw_app của Gateway).
 *
 *   LED trạng thái → NVS → màn hình (board_display + node_ui) → cấu hình (node_config) → ESP-NOW tới Gateway
 *   (node_link) → điều hòa IR (node_ac) → đèn, quạt (node_switches) + rèm (node_curtain) → mic/loa (node_audio, mặc
 *   định tắt)
 *   task climate: SHT31 2 s/lần → màn hình + số đo mới nhất.
 *   task report (200 ms): góc kết nối trên màn hình, LED; TELEMETRY có HMAC → Gateway mỗi
 *                 CONFIG_NODE_APP_TELEMETRY_INTERVAL_S hoặc ngay khi tải đổi trạng thái:
 *                 {temperature, humidity, ac, ac_temp, lamp, fan, curtain}; ac_codes đi gói riêng khi đổi (giới hạn 246
 *                 byte/khung). SHT31 lỗi thì gói vẫn mang trạng thái tải (Server tính tải online theo gói của Node).
 *
 * Chưa cấp phát (NVS thiếu identity) hoặc chưa ghép nối (thiếu MAC Gateway / LMK): màn hình, cảm biến và tải vẫn chạy
 * (điều khiển tại chỗ), góc phải màn hình báo "Chưa ghép nối Gateway", LED đỏ nháy chậm.
 *
 * Lệnh từ Server (CMD có params.target, Gateway thêm theo UID "<node_id>-<target>"):
 *   ac       turn_on, turn_off, set_temp_<16..30>, learn_off, learn_t<16..30>   (node_ac, ack sau khi phát / học)
 *   lamp,fan turn_on, turn_off, toggle                                          (node_switches, ack sau khi đóng/cắt)
 *   curtain  turn_on (mở hẳn), turn_off (đóng hẳn), toggle, stop, set_pos_<0..100> (node_curtain, ack khi bắt đầu chạy)
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
