#include "gw_local_http.h"

#include <inttypes.h>
#include <stdlib.h>
#include <string.h>

#include "esp_check.h"
#include "esp_heap_caps.h"
#include "esp_http_server.h"
#include "esp_log.h"
#include "gw_config.h"
#include "gw_registry.h"
#include "gw_time.h"
#include "gw_wifi.h"
#include "lwip/sockets.h"

static const char *TAG = "gw_local_http";

#define TS_DIGITS_MAX 12
#define RECV_TIMEOUT_RETRIES 3

static httpd_handle_t s_server;
static gw_snapshot_cb_t s_on_snapshot;
static void *s_ctx;
static int64_t s_last_ts[GW_REGISTRY_MAX];   /* chỉ task httpd truy cập */

static esp_err_t reply(httpd_req_t *req, const char *status, const char *error)
{
    httpd_resp_set_status(req, status);
    httpd_resp_set_type(req, "application/json");
    if (error != NULL) {
        /* Yêu cầu bị từ chối thường còn thân chưa đọc — đóng kết nối thay vì đọc bỏ. */
        httpd_resp_set_hdr(req, "Connection", "close");
        char body[48];
        snprintf(body, sizeof(body), "{\"error\":\"%s\"}", error);
        return httpd_resp_sendstr(req, body);
    }
    return httpd_resp_sendstr(req, "{\"status\":\"ok\"}");
}

static bool get_hdr(httpd_req_t *req, const char *name, char *buf, size_t cap)
{
    size_t n = httpd_req_get_hdr_value_len(req, name);
    if (n == 0 || n >= cap) {
        return false;
    }
    return httpd_req_get_hdr_value_str(req, name, buf, cap) == ESP_OK;
}

/* ts chỉ gồm chữ số, tối đa 12 ký tự — chặn tràn khi parse. */
static bool parse_ts(const char *s, int64_t *out)
{
    size_t n = strlen(s);
    if (n == 0 || n > TS_DIGITS_MAX) {
        return false;
    }
    int64_t v = 0;
    for (size_t i = 0; i < n; i++) {
        if (s[i] < '0' || s[i] > '9') {
            return false;
        }
        v = v * 10 + (s[i] - '0');
    }
    *out = v;
    return true;
}

/* Kết nối phải tới IP của Gateway trên Local AP — không nhận ảnh từ mạng router của nhà. */
static bool from_local_ap(httpd_req_t *req)
{
    esp_ip4_addr_t ap_ip;
    if (!gw_wifi_ap_ip(&ap_ip)) {
        return false;
    }
    struct sockaddr_storage addr;
    socklen_t len = sizeof(addr);
    if (getsockname(httpd_req_to_sockfd(req), (struct sockaddr *)&addr, &len) != 0) {
        return false;
    }
    uint32_t local;
    if (addr.ss_family == AF_INET) {
        local = ((const struct sockaddr_in *)&addr)->sin_addr.s_addr;
    } else if (addr.ss_family == AF_INET6) {
        /* httpd mở socket IPv6; kết nối IPv4 hiện dạng ::ffff:a.b.c.d */
        static const uint8_t V4_MAPPED[12] = {0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0xff, 0xff};
        const uint8_t *b = ((const struct sockaddr_in6 *)&addr)->sin6_addr.s6_addr;
        if (memcmp(b, V4_MAPPED, sizeof(V4_MAPPED)) != 0) {
            return false;
        }
        memcpy(&local, b + 12, sizeof(local));
    } else {
        return false;
    }
    return local == ap_ip.addr;
}

static esp_err_t snapshot_handler(httpd_req_t *req)
{
    if (!from_local_ap(req)) {
        ESP_LOGW(TAG, "reject snapshot: not received on local AP interface");
        return reply(req, "403 Forbidden", "LOCAL_AP_ONLY");
    }

    char dev_id[GW_DEVICE_ID_MAX + 1];
    char ts_str[TS_DIGITS_MAX + 2];
    char sig[SM_HMAC_HEX_LEN + 2];
    char trigger[12];
    char ctype[32];
    char cmd_id[GW_COMMAND_ID_MAX + 1] = "";
    int64_t ts;
    if (!get_hdr(req, "X-Device-Id", dev_id, sizeof(dev_id)) || !get_hdr(req, "X-Timestamp", ts_str, sizeof(ts_str)) ||
        !get_hdr(req, "X-Signature", sig, sizeof(sig)) || !get_hdr(req, "X-Trigger", trigger, sizeof(trigger)) ||
        !parse_ts(ts_str, &ts)) {
        return reply(req, "400 Bad Request", "MISSING_HEADERS");
    }
    gw_snap_trigger_t trig;
    if (strcmp(trigger, "motion") == 0) {
        trig = GW_SNAP_MOTION;
    } else if (strcmp(trigger, "request") == 0) {
        trig = GW_SNAP_REQUEST;
    } else {
        return reply(req, "400 Bad Request", "BAD_TRIGGER");
    }
    if (httpd_req_get_hdr_value_len(req, "X-Command-Id") > 0 &&
        (!get_hdr(req, "X-Command-Id", cmd_id, sizeof(cmd_id)) || !gw_valid_id(cmd_id, GW_COMMAND_ID_MAX))) {
        return reply(req, "400 Bad Request", "BAD_COMMAND_ID");
    }

    /* Thiết bị lạ hay sai chữ ký đều trả 401 như nhau — không cho dò device_id. */
    int idx = gw_valid_id(dev_id, GW_DEVICE_ID_MAX) ? gw_registry_find_id(dev_id) : -1;
    if (idx < 0 || gw_registry_get((size_t)idx)->kind != GW_DEV_CAMERA) {
        ESP_LOGW(TAG, "reject snapshot: unknown camera");
        return reply(req, "401 Unauthorized", "AUTH_FAIL");
    }
    int64_t now;
    if (!gw_time_now(&now)) {
        ESP_LOGW(TAG, "reject snapshot: gateway clock not synced");
        return reply(req, "503 Service Unavailable", "CLOCK_NOT_SYNCED");
    }
    sm_verify_result_t r = gw_registry_verify((size_t)idx, ts, sig, now);
    if (r != SM_VERIFY_OK) {
        ESP_LOGW(TAG, "reject snapshot from %s: %s", dev_id,
                 r == SM_VERIFY_EXPIRED ? "timestamp outside ±300 s" : "bad signature");
        return reply(req, "401 Unauthorized", "AUTH_FAIL");
    }
    if (ts < s_last_ts[idx]) {
        ESP_LOGW(TAG, "reject snapshot from %s: timestamp older than previous (replay?)", dev_id);
        return reply(req, "401 Unauthorized", "AUTH_FAIL");
    }

    if (!get_hdr(req, "Content-Type", ctype, sizeof(ctype)) || strncmp(ctype, "image/jpeg", 10) != 0) {
        return reply(req, "415 Unsupported Media Type", "JPEG_ONLY");
    }
    size_t len = req->content_len;
    if (len == 0) {
        return reply(req, "411 Length Required", "EMPTY_BODY");
    }
    if (len > GW_SNAPSHOT_MAX_BYTES) {
        ESP_LOGW(TAG, "reject snapshot from %s: %u bytes > %d", dev_id, (unsigned)len, GW_SNAPSHOT_MAX_BYTES);
        return reply(req, "413 Payload Too Large", "TOO_LARGE");
    }

    uint8_t *jpeg = heap_caps_malloc(len, MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT);
    if (jpeg == NULL) {
        return reply(req, "503 Service Unavailable", "NO_MEMORY");
    }
    size_t got = 0;
    int timeouts = 0;
    while (got < len) {
        int n = httpd_req_recv(req, (char *)jpeg + got, len - got);
        if (n == HTTPD_SOCK_ERR_TIMEOUT && ++timeouts <= RECV_TIMEOUT_RETRIES) {
            continue;
        }
        if (n <= 0) {
            free(jpeg);
            ESP_LOGW(TAG, "snapshot from %s: body receive failed", dev_id);
            return ESP_FAIL;   /* httpd đóng kết nối */
        }
        got += (size_t)n;
    }
    if (len < 4 || jpeg[0] != 0xFF || jpeg[1] != 0xD8) {
        free(jpeg);
        return reply(req, "415 Unsupported Media Type", "NOT_JPEG");
    }
    s_last_ts[idx] = ts;

    gw_snapshot_t snap = {
        .camera_idx = (size_t)idx,
        .trigger = trig,
        .ts = ts,
        .jpeg = jpeg,
        .len = len,
    };
    strlcpy(snap.command_id, cmd_id, sizeof(snap.command_id));
    if (s_on_snapshot == NULL || !s_on_snapshot(&snap, s_ctx)) {
        free(jpeg);
        return reply(req, "503 Service Unavailable", "BUSY");
    }
    ESP_LOGI(TAG, "snapshot from %s: %u bytes (%s%s%s)", dev_id, (unsigned)len, trigger, cmd_id[0] ? ", command " : "",
             cmd_id);
    return reply(req, "201 Created", NULL);
}

esp_err_t gw_local_http_start(gw_snapshot_cb_t on_snapshot, void *ctx)
{
    ESP_RETURN_ON_FALSE(s_server == NULL, ESP_ERR_INVALID_STATE, TAG, "already started");
    s_on_snapshot = on_snapshot;
    s_ctx = ctx;

    httpd_config_t cfg = HTTPD_DEFAULT_CONFIG();
    cfg.server_port = 80;
    cfg.max_open_sockets = 4;
    cfg.lru_purge_enable = true;
    cfg.recv_wait_timeout = 5;
    cfg.send_wait_timeout = 5;
    cfg.stack_size = 6144;
    cfg.core_id = 0;   /* nhân 1 dành cho LVGL */
    ESP_RETURN_ON_ERROR(httpd_start(&s_server, &cfg), TAG, "httpd_start");

    const httpd_uri_t snapshot = {
        .uri = "/local/camera/snapshot",
        .method = HTTP_POST,
        .handler = snapshot_handler,
    };
    ESP_RETURN_ON_ERROR(httpd_register_uri_handler(s_server, &snapshot), TAG, "register");
    ESP_LOGI(TAG, "local HTTP server on :80 (POST /local/camera/snapshot)");
    return ESP_OK;
}
