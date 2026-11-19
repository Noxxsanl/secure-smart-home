/*
 * node_ac — điều hòa phòng khách qua hồng ngoại (riêng của application).
 *
 * Cách làm: HỌC MÃ THÔ. Remote điều hòa mỗi lần bấm gửi TOÀN BỘ trạng thái (bật/tắt, chế độ, nhiệt độ, quạt...)
 * trong 1–3 khung dài, không phải lệnh "tăng 1 độ". Nên Node học riêng từng trạng thái cần dùng rồi phát lại y hệt:
 *   ac_off           mã TẮT
 *   ac_t16..ac_t30   mã BẬT chế độ Lạnh ở 16..30°C (bấm remote khi đã chỉnh đúng chế độ + nhiệt độ)
 * Mã lưu trong NVS (node_ir_store, sóng mang 38 kHz), mỗi mã ~0,5–2 KB. Không cần biết hãng / giao thức.
 *
 * Một task riêng phát/thu IR (học mã chặn tới 10 s), nhận việc từ màn hình (node_ui callback) và từ Gateway
 * (CMD có params.target = "ac": turn_on, turn_off, set_temp_<16..30> → ack kèm power; learn_off, learn_t<16..30>
 * = học mã từ web app → ack sau khi thu + lưu xong, ok/lỗi).
 */
#pragma once

#include <stdbool.h>
#include <stdint.h>

#include "esp_err.h"

#ifdef __cplusplus
extern "C" {
#endif

/** Gọi sau nvs_flash_init và node_ui_start. ESP_ERR_NOT_SUPPORTED nếu tắt IR trong menuconfig. */
esp_err_t node_ac_start(void);

/**
 * Lệnh từ Gateway (gọi trong task node_link). true = đã nhận, node_ac tự gửi CMD_ACK sau khi phát.
 * false = không nhận (chưa chạy, đang học mã, hàng đợi đầy) — người gọi gửi ack lỗi.
 */
bool node_ac_post_command(const char *command_id, const char *action);

/** Trạng thái để gửi telemetry (khoá "ac", "ac_temp"). false nếu chưa biết (chưa phát mã nào từ lúc khởi động). */
bool node_ac_get_state(bool *on, int *setpoint_c);

/** Mã đã học (khoá telemetry "ac_codes"): bit 0 = TẮT, bit (t - 15) = t°C. false nếu IR chưa chạy. */
bool node_ac_get_codes(uint32_t *mask);

/** true (và xoá cờ) nếu trạng thái / mã đã học vừa đổi — task gửi telemetry nên gửi ngay, không chờ hết chu kỳ. */
bool node_ac_take_changed(void);

#ifdef __cplusplus
}
#endif
