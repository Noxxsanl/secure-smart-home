/*
 * gw_registry — thiết bị đã ghép với Gateway (Node phòng khách, Camera) đọc từ NVS namespace "nodes".
 *
 *   nodes/count       u8, số thiết bị (≤ GW_REGISTRY_MAX)
 *   nodes/<i>_kind    "node" | "camera"
 *   nodes/<i>_id      device_id trên backend (Node: device_type = sensor để backend nhận telemetry)
 *   nodes/<i>_secret  CHỈ camera: secret camera để kiểm ảnh /local/camera/snapshot và ký yêu cầu mở luồng /stream.
 *                     Node KHÔNG có: Gateway không giữ secret Node — chữ ký telemetry v2 của Node chỉ backend kiểm
 *                     (lớp 2 độc lập với Gateway); dòng cũ nếu còn thì bị bỏ qua (cảnh báo).
 *   nodes/<i>_mac     MAC Station của thiết bị, "AA:BB:CC:DD:EE:FF" — gói ESP-NOW chỉ nhận từ MAC này
 *   nodes/<i>_lmk     LMK ESP-NOW 16 byte = 32 hex, trùng pairing/session_key của thiết bị (xác thực chặng ESP-NOW)
 *
 * Giai đoạn dev nạp tay (nvs_dev.csv, sinh giá trị ngẫu nhiên: backend `npm run hw:rotate`); sau này ghi bởi luồng
 * ghép nối ECDH (WiFi Provisioning §9). Secret và LMK chỉ nằm trong gw_registry.c: tầng khác kiểm/ký qua
 * gw_registry_cam_upload_verify/cam_stream_sign, không đọc được giá trị (bất biến 1, 2).
 *
 * Bảng cố định sau gw_registry_load (đọc không cần khoá); trạng thái chạy (online, RSSI…) có mutex riêng.
 */
#pragma once

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

#include "esp_err.h"
#include "security_manager.h"

#ifdef __cplusplus
extern "C" {
#endif

#define GW_REGISTRY_MAX 8   /* ≤ CONFIG_ESP_WIFI_ESPNOW_MAX_ENCRYPT_NUM */
#define GW_DEVICE_ID_MAX 64
#define GW_LMK_LEN 16
#define GW_FW_VERSION_MAX 31

typedef enum {
    GW_DEV_NODE = 0,
    GW_DEV_CAMERA = 1,
} gw_dev_kind_t;

/** Thông tin công khai (không có secret/LMK). */
typedef struct {
    char device_id[GW_DEVICE_ID_MAX + 1];
    gw_dev_kind_t kind;
    uint8_t mac[6];
    bool has_lmk;
} gw_device_info_t;

typedef struct {
    bool online;
    int64_t last_seen_us;     /* esp_timer_get_time(); 0 = chưa thấy từ lúc Gateway khởi động */
    int64_t last_seen_unix;   /* giờ unix lần cuối nhận gói hợp lệ, nhớ qua khởi động lại (NVS "seen"); 0 = chưa từng */
    int rssi;                 /* dBm của gói ESP-NOW gần nhất — chỉ có nghĩa khi last_seen_us != 0 */
    uint32_t uptime_s;
    char fw_version[GW_FW_VERSION_MAX + 1];
} gw_device_status_t;

/**
 * Cần nvs_flash_init() trước. Bỏ qua (có log) mục sai định dạng, trùng MAC/id, hoặc trùng gateway_id.
 * Trả ESP_OK kể cả khi không có thiết bị nào (Gateway vẫn chạy, chỉ không nhận gói).
 */
esp_err_t gw_registry_load(const char *gateway_id);

size_t gw_registry_count(void);
const gw_device_info_t *gw_registry_get(size_t idx);

/** Chỉ số thiết bị, -1 nếu không có. */
int gw_registry_find_mac(const uint8_t mac[6]);
int gw_registry_find_id(const char *device_id);

/*
 * Chữ ký Camera ↔ Gateway (v2, security_manager) bằng secret camera idx — secret không rời file này. Chuỗi ký:
 *   ảnh Camera → Gateway:  "v2|cam-up|<cam_id>|<ts>|<ctr>|<trigger>|<command_id hoặc rỗng>"
 *   luồng Gateway → Camera: "v2|cam-stream|<cam_id>|<ts>|<ctr>|<fs>|<q>" (fs, q đã chuẩn hoá)
 * Chỉ camera (kind camera) mới có secret. Verify kiểm cửa sổ ±300 s rồi so thời gian hằng, KHÔNG kiểm ctr (bên gọi tự
 * so ctr với last_ctr của camera).
 */
sm_verify_result_t gw_registry_cam_upload_verify(size_t idx, int64_t ts, int64_t ctr, const char *trigger,
                                                 const char *command_id, const char *sig_hex, int64_t now);
esp_err_t gw_registry_cam_stream_sign(size_t idx, int64_t ts, int64_t ctr, const char *fs, int q,
                                      char out_hex[SM_HMAC_HEX_LEN + 1]);

/** Chép LMK cho gw_espnow thêm peer. Bên gọi phải xoá bản sao (mbedtls_platform_zeroize). */
bool gw_registry_copy_lmk(size_t idx, uint8_t out[GW_LMK_LEN]);

/** Ghi nhận vừa thấy gói hợp lệ từ thiết bị. */
void gw_registry_touch(size_t idx, int rssi);
void gw_registry_set_heartbeat(size_t idx, uint32_t uptime_s, const char *fw_version);

/** Bản sao trạng thái; online tính theo CONFIG_GW_NODE_OFFLINE_S. */
bool gw_registry_status(size_t idx, gw_device_status_t *out);

/**
 * Ghi "lần cuối thấy" của từng thiết bị xuống NVS (namespace "seen", khoá "s<i>" = giờ unix, "h<i>" = băm device_id
 * để bỏ giá trị cũ khi danh sách nodes đổi). Gọi định kỳ (~1 phút) từ 1 task. Để không mòn flash: thiết bị đang trực
 * tuyến chỉ ghi khi cách lần ghi trước ≥ 5 phút; mất kết nối thì ghi đúng mốc cuối 1 lần. force = ghi mọi giá trị mới
 * (VD trước khi khởi động lại). Cần Gateway có giờ.
 */
void gw_registry_save_seen(bool force);

#ifdef __cplusplus
}
#endif
