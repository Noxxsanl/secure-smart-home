/*
 * gw_camera_relay — chuyển tiếp khung JPEG của camera lên Server để khách xem từ xa (web app user), không ghi lại
 * (docs/firmware/IOT_NODE_NETWORK.md §5.5).
 *
 *   WebSocket qua TLS:  GET wss://<host>/api/device/camera/live   (esp_transport_ssl + esp_transport_ws của ESP-IDF)
 *   Header:  X-Gateway-Id, X-Device-Id (camera), X-Session-Id, X-Timestamp,
 *            X-Signature = HMAC-SHA256(secret gateway, "<gateway_id>:<ts>:<device_id>:<session_id>") hex thường
 *   Gateway → Server:  nhị phân = đúng 1 khung JPEG nguyên vẹn (opcode BINARY|FIN)
 *                      văn bản {"type":"status","state":"connecting"|"streaming"|"camera_unavailable"}
 *                      (khi đổi trạng thái; mỗi 5 s khi không có khung) và {"type":"end"} trước khi tự đóng.
 *   Server → Gateway:  không bắt buộc gì; close frame = dừng hẳn (không nối lại); PING được trả PONG.
 *
 * Phiên do Server làm chủ: lệnh MQTT live_start / live_stop (command_id = session_id) đi qua gw_app, gw_app gọi
 * gw_camera_relay_start / _stop. Mất mạng giữa phiên, hoặc upgrade bị trả 409 (uplink cũ còn sống) / 429 (giới hạn tần
 * suất) → nối lại CÙNG session sau 1, 2, 4 s (ký lại ts + chữ ký). Server đóng WS (close frame) hoặc trả 400/401/403/404
 * lúc upgrade → không nối lại; hết 3 lần nối lại → dừng phiên đó và chờ live_start mới. Hai trường hợp sau gọi on_ended.
 *
 * Giới hạn tốc độ CONFIG_GW_CAMERA_RELAY_MAX_FPS. Chỉ giữ 1 khung MỚI NHẤT chờ gửi (offer ghi đè khung cũ chưa kịp gửi,
 * đếm vào "khung bỏ"); task relay riêng, không bao giờ chặn task kéo luồng camera. Khung được chép sang bộ đệm riêng
 * trước khi gửi vì tầng WebSocket che (mask) dữ liệu TẠI CHỖ — không thể gửi thẳng từ bộ đệm đang chia sẻ với LCD.
 *
 * URL lấy từ gw_api (cùng base URL + chính sách gw_tls_uri_allowed): https → wss kiểm chứng CA nhúng (gw_tls), http →
 * ws chỉ khi bật [DEV] CONFIG_GW_DEV_ALLOW_PLAINTEXT. Không bao giờ tắt kiểm chứng chứng chỉ (bất biến 3).
 * Không log session_id, chữ ký, secret (bất biến 2).
 */
#pragma once

#include <stdbool.h>

#include "esp_err.h"
#include "gw_camera_live.h"

#ifdef __cplusplus
extern "C" {
#endif

/** Tình trạng nguồn hình (do gw_app báo từ gw_camera_live) — dùng để chọn nội dung tin status. */
typedef enum {
    GW_RELAY_SRC_CONNECTING = 0,   /* đang mở luồng từ camera */
    GW_RELAY_SRC_STREAMING,        /* camera đang gửi khung */
    GW_RELAY_SRC_UNAVAILABLE,      /* camera mất kết nối / chưa vào Local AP / hỏng luồng */
} gw_relay_source_t;

/** Phiên tự kết thúc (Server đóng, bị từ chối 4xx, hoặc hết số lần nối lại). Gọi trong task relay — chỉ đẩy việc đi. */
typedef void (*gw_camera_relay_ended_cb)(void *ctx);

/** Tạo task + bộ đệm gửi (PSRAM, GW_CAMERA_LIVE_FRAME_MAX). Gọi 1 lần. */
esp_err_t gw_camera_relay_init(gw_camera_relay_ended_cb on_ended, void *ctx);

/**
 * Mở phiên (không chặn, task relay tự kết nối). Đang có phiên khác → đóng phiên cũ (gửi end) rồi mở phiên mới.
 * ESP_ERR_INVALID_STATE nếu gw_api chưa có URL hợp lệ; ESP_ERR_INVALID_ARG nếu id sai định dạng.
 */
esp_err_t gw_camera_relay_start(const char *camera_id, const char *session_id);

/** Đóng phiên (không chặn). session_id != NULL: chỉ đóng khi trùng phiên hiện tại. Trả true nếu đã đóng. */
bool gw_camera_relay_stop(const char *session_id);

/** true khi đang có phiên (kể cả lúc đang kết nối / chờ nối lại). */
bool gw_camera_relay_active(void);

void gw_camera_relay_set_source(gw_relay_source_t src);

/**
 * Đề nghị 1 khung để gửi — gọi TRONG on_frame của gw_camera_live (giữ khung bằng gw_live_frame_ref khi nhận).
 * Không có phiên → false, không giữ gì. Có → true; khung cũ chưa gửi bị thay (và được trả lại).
 */
bool gw_camera_relay_offer(gw_live_frame_t *frame);

#ifdef __cplusplus
}
#endif
