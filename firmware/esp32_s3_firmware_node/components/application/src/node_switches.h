/*
 * node_switches — đèn và quạt qua relay HF46F 12 V (riêng của application).
 *
 * Nguồn lệnh, xử lý tuần tự trong 1 task (đóng/cắt relay → màn hình → NVS → ack):
 *   - Gateway: CMD có params.target = "lamp" / "fan", action turn_on, turn_off, toggle → ack NGAY sau khi đóng/cắt,
 *     kèm power (Gateway chờ ack tối đa 3 s).
 *   - Màn hình: chạm ô Đèn / Quạt = đảo trạng thái.
 *
 * Có điện lại: khôi phục trạng thái đã lưu NVS (menuconfig "Node S3: ứng dụng" → NODE_APP_RESTORE_SWITCHES, mặc định
 * bật). Trạng thái gửi kèm telemetry: lamp, fan (0/1).
 */
#pragma once

#include <stdbool.h>

#include "esp_err.h"

#ifdef __cplusplus
extern "C" {
#endif

typedef enum {
    NODE_SWITCH_LAMP = 0,
    NODE_SWITCH_FAN,
    NODE_SWITCH_COUNT,
} node_switch_t;

/** Gọi sau node_ui_start (và nvs_flash_init nếu có). ESP_ERR_NOT_SUPPORTED nếu relay tắt trong menuconfig. */
esp_err_t node_switches_start(void);

/**
 * Lệnh từ Gateway (gọi trong task node_link). true = đã nhận, node_switches tự gửi CMD_ACK.
 * false = không nhận (chưa chạy, hàng đợi đầy) — người gọi gửi ack lỗi.
 */
bool node_switches_post_command(node_switch_t sw, const char *command_id, const char *action);

/** Trạng thái để gửi telemetry. false nếu relay chưa chạy. */
bool node_switches_get(node_switch_t sw, bool *on);

/** true (và xoá cờ) nếu đèn/quạt vừa đổi trạng thái — gửi telemetry ngay, không chờ hết chu kỳ. */
bool node_switches_take_changed(void);

#ifdef __cplusplus
}
#endif
