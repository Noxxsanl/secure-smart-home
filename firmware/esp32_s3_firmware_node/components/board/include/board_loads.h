/*
 * board_loads — tải của Node: relay HF46F 12 V (đèn, quạt) và động cơ bước 28BYJ-48 5 V qua ULN2003 (rèm cửa).
 *
 * Chân + mức kích: menuconfig "Node S3: relay (đèn, quạt)" (mặc định Relay_1 GPIO41 = Đèn, Relay_2 GPIO42 = Quạt,
 * mức CAO = đóng) và "Node S3: rèm cửa (ULN2003 + động cơ bước)" (mặc định IN1..IN4 = GPIO8, 18, 17, 16).
 *
 * Relay: mọi kênh TẮT sau init; đóng/cắt nhanh hơn khoảng cách tối thiểu trong menuconfig bị từ chối.
 * Rèm: vị trí là số nửa bước (không có công tắc hành trình — tầng trên tự chặn trong [0, hành trình]); động cơ chạy
 * không chặn task gọi, dừng thì ngắt dòng cuộn dây.
 */
#pragma once

#include <stdbool.h>
#include <stdint.h>

#include "esp_err.h"

#ifdef __cplusplus
extern "C" {
#endif

typedef enum {
    BOARD_RELAY_LAMP = 0,   /* Relay_1 */
    BOARD_RELAY_FAN,        /* Relay_2 */
    BOARD_RELAY_COUNT,
} board_relay_t;

/** ESP_ERR_NOT_SUPPORTED nếu tắt trong menuconfig. Gọi lại khi đã chạy: ESP_OK. */
esp_err_t board_relays_init(void);

bool board_relays_ready(void);

/**
 * ESP_ERR_INVALID_STATE nếu relay vừa đổi chưa đủ khoảng cách tối thiểu (menuconfig) hoặc chưa init.
 * Đặt lại đúng trạng thái đang có: ESP_OK.
 */
esp_err_t board_relay_set(board_relay_t relay, bool on);

/** Trạng thái đang đặt; false nếu chưa init. */
bool board_relay_get(board_relay_t relay);

/**
 * Báo khi động cơ rèm dừng: position = số nửa bước, reached = tới đúng đích (false nếu bị board_curtain_stop).
 * Chạy trong task esp_timer: chỉ được đẩy việc sang task khác, không chặn.
 */
typedef void (*board_curtain_done_cb_t)(int32_t position, bool reached, void *ctx);

/** ESP_ERR_NOT_SUPPORTED nếu tắt trong menuconfig. Vị trí ban đầu = 0 (tầng trên nạp lại vị trí đã lưu). */
esp_err_t board_curtain_init(board_curtain_done_cb_t done_cb, void *ctx);

bool board_curtain_ready(void);

/** Hành trình mặc định (nửa bước, từ ĐÓNG hẳn tới MỞ hẳn) trong menuconfig — dùng khi chưa hiệu chuẩn. 0 nếu tắt. */
int32_t board_curtain_default_travel(void);

/** Không chặn; đang chạy thì đổi đích. ESP_ERR_INVALID_STATE nếu chưa init. */
esp_err_t board_curtain_move_to(int32_t position);

esp_err_t board_curtain_stop(void);

/** Đặt lại số đếm (hiệu chuẩn / nạp vị trí đã lưu). ESP_ERR_INVALID_STATE nếu đang chạy hoặc chưa init. */
esp_err_t board_curtain_set_position(int32_t position);

int32_t board_curtain_position(void);

bool board_curtain_moving(void);

#ifdef __cplusplus
}
#endif
