/*
 * Đồng hồ của camera. Camera không có NTP: Gateway gửi TIME_SYNC {ts} qua ESP-NOW (IOT_NODE_NETWORK §7).
 * Chưa đồng bộ thì không ký/kiểm được HMAC (cửa sổ ±300 giây).
 */
#pragma once

#include <stdbool.h>
#include <stdint.h>

void cam_time_init(void);

/** Đặt giờ hệ thống từ TIME_SYNC. Bỏ qua ts vô lý (trước 2023-11). */
bool cam_time_set_unix(int64_t ts, const char *source);

bool cam_time_is_synced(void);

/** Giờ unix hiện tại; false nếu chưa đồng bộ. */
bool cam_time_now(int64_t *out);
