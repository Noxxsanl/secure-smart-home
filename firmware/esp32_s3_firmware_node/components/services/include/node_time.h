/*
 * Đồng hồ của node. Node không có NTP: Gateway gửi TIME_SYNC {ts} qua ESP-NOW (IOT_NODE_NETWORK §7)
 * sau ghép nối, khi node gửi PING, và kèm ack.
 * Chưa đồng bộ thì KHÔNG ký telemetry (backend chỉ nhận lệch ±300 giây).
 */
#pragma once

#include <stdbool.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

/** Đặt giờ hệ thống. Bỏ qua ts vô lý (trước 2023-11 hoặc sau 2100). */
bool node_time_set_unix(int64_t ts, const char *source);

bool node_time_is_synced(void);

/** Giờ unix hiện tại; false nếu chưa đồng bộ. */
bool node_time_now(int64_t *out);

#ifdef __cplusplus
}
#endif
