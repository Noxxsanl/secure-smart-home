/*
 * espnow_proto — khung tin ESP-NOW Gateway ↔ Node/Camera (docs/API_DESIGN.md §11, IOT_NODE_NETWORK §5.1).
 *
 *   | ver (u8) | type (u8) | seq (u16, little-endian) | body (JSON thu gọn, không có NUL) |
 *   tổng ≤ 250 byte (ESP-NOW v1).
 *
 * Mã số `type` dưới đây là ĐỀ XUẤT (docs mới chốt tên, chưa chốt giá trị) — Gateway phải dùng chung file này,
 * đổi giá trị thì đổi ở đây cho mọi project.
 */
#pragma once

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

#define ESPNOW_PROTO_VERSION 1
#define ESPNOW_PROTO_HDR_LEN 4
#define ESPNOW_PROTO_MAX_LEN 250
#define ESPNOW_PROTO_MAX_BODY (ESPNOW_PROTO_MAX_LEN - ESPNOW_PROTO_HDR_LEN)

typedef enum {
    ESPNOW_MSG_PING = 0x01,           /* Node → GW  {}                                   */
    ESPNOW_MSG_TIME_SYNC = 0x02,      /* GW → Node  {ts}                                 */
    ESPNOW_MSG_HEARTBEAT = 0x03,      /* Node → GW  {uptime, rssi, fw_version, battery?} */
    ESPNOW_MSG_TELEMETRY = 0x10,      /* Node → GW  sensor_payload                       */
    ESPNOW_MSG_EVENT = 0x11,          /* Node → GW  {event, ts}                          */
    ESPNOW_MSG_CMD = 0x20,            /* GW → Node  {command_id, action, params?}        */
    ESPNOW_MSG_CMD_ACK = 0x21,        /* Node → GW  {command_id, status, power?}         */
    ESPNOW_MSG_PAIR_REQUEST = 0x30,   /* Ghép nối — WiFi Provisioning §9.1 (chưa làm)    */
    ESPNOW_MSG_PAIR_CHALLENGE = 0x31,
    ESPNOW_MSG_PAIR_RESPONSE = 0x32,
    ESPNOW_MSG_PAIR_RESULT = 0x33,
} espnow_msg_type_t;

typedef struct {
    uint8_t ver;
    uint8_t type;
    uint16_t seq;
    const uint8_t *body;   /* trỏ vào bộ đệm gốc, KHÔNG kết thúc bằng NUL */
    size_t body_len;
} espnow_frame_view_t;

/** Ghép khung vào `out`. Trả tổng số byte, 0 nếu không vừa (body quá dài / cap nhỏ). */
size_t espnow_proto_encode(uint8_t *out, size_t cap, uint8_t type, uint16_t seq,
                           const char *body, size_t body_len);

/** Tách khung; false nếu quá ngắn, quá dài hoặc sai phiên bản. */
bool espnow_proto_decode(const uint8_t *data, size_t len, espnow_frame_view_t *out);

#ifdef __cplusplus
}
#endif
