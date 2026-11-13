#include "gw_camera_relay.h"

#include <inttypes.h>
#include <stdatomic.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "esp_check.h"
#include "esp_heap_caps.h"
#include "esp_log.h"
#include "esp_timer.h"
#include "esp_transport.h"
#include "esp_transport_ssl.h"
#include "esp_transport_tcp.h"
#include "esp_transport_ws.h"
#include "freertos/FreeRTOS.h"
#include "freertos/semphr.h"
#include "freertos/task.h"
#include "gw_api.h"
#include "gw_config.h"
#include "gw_time.h"
#include "gw_tls.h"
#include "mbedtls/platform_util.h"
#include "sdkconfig.h"

static const char *TAG = "gw_camera_relay";

#define RELAY_PATH "/api/device/camera/live"
#define RELAY_TASK_STACK 10240          /* bắt tay TLS chạy trên stack của task này */
#define RELAY_TASK_PRIO 2               /* dưới task kéo luồng (3) và gw_app (4) */
#define RELAY_TASK_CORE 0
#define CONNECT_TIMEOUT_MS 10000        /* TCP + TLS (mbedTLS trong PSRAM) + upgrade */
#define SEND_TIMEOUT_MS 5000            /* 1 khung ≤ 200 KB; quá hạn → coi là rớt mạng */
#define GOODBYE_SEND_MS 250             /* gửi end / close khi đóng phiên: end + close + chờ ≤ ~1 s để đổi phiên nhanh */
#define CLOSE_WAIT_MS 500               /* chờ Server đáp close frame */
#define RETRY_MAX 3                     /* nối lại sau 1, 2, 4 s */
#define STATUS_PERIOD_US (5 * 1000 * 1000LL)
#define STREAMING_GRACE_US (3 * 1000 * 1000LL)   /* gửi được khung trong ngần này thì coi là "streaming" */
#define STATS_US (5 * 1000 * 1000LL)
#define WAIT_SLICE_MS 50                /* tối đa chờ giữa 2 lần xem tin từ Server / đến hạn gửi status */
#define MIN_INTERVAL_US (1000000LL / CONFIG_GW_CAMERA_RELAY_MAX_FPS)
#define RX_BUF 128                      /* tin từ Server chỉ là control frame ≤ 125 byte */
#define HOST_MAX 64
#define HDR_MAX 512

typedef struct {
    char camera[GW_ID_MAX + 1];
    char session[GW_ID_MAX + 1];
} req_t;

typedef enum {
    RUN_STOPPED,       /* gw_app đóng / thay phiên — end đã gửi */
    RUN_SERVER_CLOSED, /* Server đóng bằng close frame */
    RUN_REJECTED,      /* upgrade bị từ chối 4xx hoặc cấu hình sai: nối lại cũng vô ích */
    RUN_NET_ERROR,     /* rớt mạng / lỗi gửi: nối lại cùng phiên */
} run_result_t;

typedef enum {
    ST_CONNECTING,
    ST_STREAMING,
    ST_UNAVAILABLE,
} status_t;

static const char *const s_status_name[] = {"connecting", "streaming", "camera_unavailable"};

static SemaphoreHandle_t s_lock;               /* bảo vệ s_req */
static req_t s_req;
static atomic_uint s_gen;                      /* đổi mỗi lần start/stop: task biết phiên nó phục vụ còn hiện hành không */
static atomic_bool s_active;
static atomic_int s_source = GW_RELAY_SRC_CONNECTING;
static _Atomic(gw_live_frame_t *) s_pending;   /* hộp thư 1 ô: khung mới nhất chờ gửi */
static atomic_uint s_dropped;                  /* khung bị thay trước khi kịp gửi (cửa sổ thống kê hiện tại) */
static atomic_uint s_offered;
static uint8_t *s_tx;                          /* bộ đệm gửi riêng (ws che dữ liệu tại chỗ) */
static TaskHandle_t s_task;
static gw_camera_relay_ended_cb s_on_ended;
static void *s_ctx;

static bool current(uint32_t gen)
{
    return atomic_load(&s_gen) == gen && atomic_load(&s_active);
}

static void flush_pending(void)
{
    gw_live_frame_t *old = atomic_exchange(&s_pending, NULL);
    if (old != NULL) {
        gw_live_frame_release(old);
    }
}

/* ---- API cho gw_app + gw_camera_live ---------------------------------------------------------------------- */

esp_err_t gw_camera_relay_start(const char *camera_id, const char *session_id)
{
    ESP_RETURN_ON_FALSE(s_task != NULL, ESP_ERR_INVALID_STATE, TAG, "not initialised");
    ESP_RETURN_ON_FALSE(camera_id != NULL && session_id != NULL && gw_valid_id(camera_id, GW_ID_MAX) &&
                            gw_valid_id(session_id, GW_ID_MAX),
                        ESP_ERR_INVALID_ARG, TAG, "bad id");
    ESP_RETURN_ON_FALSE(gw_api_base_url() != NULL, ESP_ERR_INVALID_STATE, TAG, "no server URL (gw_api)");
    xSemaphoreTake(s_lock, portMAX_DELAY);
    strlcpy(s_req.camera, camera_id, sizeof(s_req.camera));
    strlcpy(s_req.session, session_id, sizeof(s_req.session));
    atomic_store(&s_source, GW_RELAY_SRC_CONNECTING);
    atomic_fetch_add(&s_gen, 1);
    atomic_store(&s_active, true);
    xSemaphoreGive(s_lock);
    xTaskNotifyGive(s_task);
    return ESP_OK;
}

bool gw_camera_relay_stop(const char *session_id)
{
    if (s_task == NULL) {
        return false;
    }
    bool stopped = false;
    xSemaphoreTake(s_lock, portMAX_DELAY);
    if (atomic_load(&s_active) && (session_id == NULL || strcmp(session_id, s_req.session) == 0)) {
        atomic_store(&s_active, false);
        atomic_fetch_add(&s_gen, 1);
        stopped = true;
    }
    xSemaphoreGive(s_lock);
    if (stopped) {
        xTaskNotifyGive(s_task);
    }
    return stopped;
}

bool gw_camera_relay_active(void)
{
    return atomic_load(&s_active);
}

void gw_camera_relay_set_source(gw_relay_source_t src)
{
    atomic_store(&s_source, (int)src);
}

bool gw_camera_relay_offer(gw_live_frame_t *frame)
{
    if (s_task == NULL || frame == NULL || !atomic_load(&s_active)) {
        return false;
    }
    gw_live_frame_ref(frame);
    atomic_fetch_add(&s_offered, 1);
    gw_live_frame_t *old = atomic_exchange(&s_pending, frame);
    if (old != NULL) {
        gw_live_frame_release(old);   /* khung cũ chưa kịp gửi: bỏ, giữ khung mới nhất */
        atomic_fetch_add(&s_dropped, 1);
    }
    if (!atomic_load(&s_active)) {
        flush_pending();   /* phiên vừa đóng giữa chừng: không để khung nằm lại giữ bộ đệm */
        return false;
    }
    xTaskNotifyGive(s_task);
    return true;
}

/* ---- URL ----------------------------------------------------------------------------------------------- */

typedef struct {
    bool secure;
    char host[HOST_MAX + 1];
    int port;
} endpoint_t;

/* "https://host[:port][/...]" hoặc "http://..." — gw_api_init đã chấp nhận scheme; ở đây chỉ tách host/port. */
static bool parse_base(const char *base, endpoint_t *ep)
{
    const char *p;
    if (strncmp(base, "https://", 8) == 0) {
        ep->secure = true;
        ep->port = 443;
        p = base + 8;
    } else if (strncmp(base, "http://", 7) == 0) {
        ep->secure = false;
        ep->port = 80;
        p = base + 7;
    } else {
        return false;
    }
    size_t n = strcspn(p, "/");
    const char *colon = memchr(p, ':', n);
    size_t hlen = colon != NULL ? (size_t)(colon - p) : n;
    if (hlen == 0 || hlen > HOST_MAX) {
        return false;
    }
    memcpy(ep->host, p, hlen);
    ep->host[hlen] = '\0';
    if (colon != NULL) {
        char num[8];
        size_t plen = n - hlen - 1;
        if (plen == 0 || plen >= sizeof(num)) {
            return false;
        }
        memcpy(num, colon + 1, plen);
        num[plen] = '\0';
        char *end;
        long v = strtol(num, &end, 10);
        if (*end != '\0' || v < 1 || v > 65535) {
            return false;
        }
        ep->port = (int)v;
    }
    return true;
}

/* ---- 1 kết nối WebSocket ------------------------------------------------------------------------------ */

typedef struct {
    esp_transport_handle_t base;
    esp_transport_handle_t ws;
} conn_t;

static void conn_close(conn_t *c)
{
    if (c->ws != NULL) {
        esp_transport_close(c->ws);   /* đóng cả socket TLS bên dưới */
        esp_transport_destroy(c->ws);
    }
    if (c->base != NULL) {
        esp_transport_destroy(c->base);
    }
    c->ws = c->base = NULL;
}

/* Trả 0 nếu đã nối; ngược lại *http_status = mã HTTP của lần upgrade (0 nếu chưa tới bước đó). */
static int conn_open(conn_t *c, const endpoint_t *ep, const req_t *req, int *http_status)
{
    *http_status = 0;
    int64_t ts;
    if (!gw_time_now(&ts)) {
        ESP_LOGW(TAG, "gateway clock not synced — cannot sign the relay request");
        return -1;
    }
    char msg[GW_ID_MAX * 3 + 40];
    int n = snprintf(msg, sizeof(msg), "%s:%" PRId64 ":%s:%s", gw_config_gateway_id(), ts, req->camera, req->session);
    if (n <= 0 || (size_t)n >= sizeof(msg)) {
        return -1;
    }
    char sig[SM_HMAC_HEX_LEN + 1];
    if (gw_config_sign(msg, sig) != ESP_OK) {
        return -1;
    }
    char hdrs[HDR_MAX];
    n = snprintf(hdrs, sizeof(hdrs),
                 "X-Gateway-Id: %s\r\nX-Device-Id: %s\r\nX-Session-Id: %s\r\nX-Timestamp: %" PRId64 "\r\nX-Signature: %s\r\n",
                 gw_config_gateway_id(), req->camera, req->session, ts, sig);
    mbedtls_platform_zeroize(sig, sizeof(sig));
    mbedtls_platform_zeroize(msg, sizeof(msg));
    if (n <= 0 || (size_t)n >= sizeof(hdrs)) {
        mbedtls_platform_zeroize(hdrs, sizeof(hdrs));
        return -1;
    }

    c->base = ep->secure ? esp_transport_ssl_init() : esp_transport_tcp_init();
    if (c->base == NULL) {
        mbedtls_platform_zeroize(hdrs, sizeof(hdrs));
        return -1;
    }
    if (ep->secure) {
        /* Kiểm chứng chứng chỉ Server bằng CA nhúng + tên host (bất biến 3): không có tuỳ chọn bỏ kiểm. */
        const char *ca = gw_tls_ca_pem();
        if (ca == NULL) {
            mbedtls_platform_zeroize(hdrs, sizeof(hdrs));
            conn_close(c);
            return -1;
        }
        esp_transport_ssl_set_cert_data(c->base, ca, (int)strlen(ca));
    }
    c->ws = esp_transport_ws_init(c->base);
    if (c->ws == NULL) {
        mbedtls_platform_zeroize(hdrs, sizeof(hdrs));
        conn_close(c);
        return -1;
    }
    const esp_transport_ws_config_t wc = {
        .ws_path = RELAY_PATH,
        .user_agent = "smart-home-gateway",
        .headers = hdrs,                      /* esp_transport_ws chép chuỗi (strdup) */
        .propagate_control_frames = true,     /* tự xử lý PING/CLOSE để phân biệt "Server đóng" với "rớt mạng" */
    };
    esp_err_t err = esp_transport_ws_set_config(c->ws, &wc);
    mbedtls_platform_zeroize(hdrs, sizeof(hdrs));
    if (err != ESP_OK) {
        conn_close(c);
        return -1;
    }
    if (esp_transport_connect(c->ws, ep->host, ep->port, CONNECT_TIMEOUT_MS) < 0) {
        *http_status = esp_transport_ws_get_upgrade_request_status(c->ws);
        conn_close(c);
        return -1;
    }
    return 0;
}

static bool send_status(esp_transport_handle_t ws, status_t st)
{
    char buf[64];   /* ws che dữ liệu tại chỗ → phải là bộ đệm ghi được */
    int n = snprintf(buf, sizeof(buf), "{\"type\":\"status\",\"state\":\"%s\"}", s_status_name[st]);
    return esp_transport_ws_send_raw(ws, WS_TRANSPORT_OPCODES_TEXT | WS_TRANSPORT_OPCODES_FIN, buf, n, SEND_TIMEOUT_MS) == n;
}

/* Báo end rồi đóng đúng thủ tục (close 1000), chờ Server đáp ngắn. Lỗi mạng ở đây không quan trọng. */
static void say_goodbye(esp_transport_handle_t ws)
{
    char end[] = "{\"type\":\"end\"}";
    esp_transport_ws_send_raw(ws, WS_TRANSPORT_OPCODES_TEXT | WS_TRANSPORT_OPCODES_FIN, end, (int)strlen(end),
                              GOODBYE_SEND_MS);
    char code[2] = {0x03, (char)0xE8};   /* 1000 */
    if (esp_transport_ws_send_raw(ws, WS_TRANSPORT_OPCODES_CLOSE | WS_TRANSPORT_OPCODES_FIN, code, 2,
                                  GOODBYE_SEND_MS) == 2) {
        esp_transport_ws_poll_connection_closed(ws, CLOSE_WAIT_MS);
    }
}

/* Đọc tin Server gửi, không chặn. 0 = bình thường, 1 = Server đóng (close frame), -1 = lỗi/đứt kết nối. */
static int poll_server(esp_transport_handle_t ws)
{
    char rx[RX_BUF];
    for (int i = 0; i < 4; i++) {
        int p = esp_transport_poll_read(ws, 0);
        if (p < 0) {
            return -1;
        }
        if (p == 0) {
            return 0;
        }
        int n = esp_transport_read(ws, rx, sizeof(rx), 1000);
        if (n < 0) {
            return -1;
        }
        const ws_transport_opcodes_t op = esp_transport_ws_get_read_opcode(ws);
        if (op == WS_TRANSPORT_OPCODES_CLOSE) {
            char code[2] = {0x03, (char)0xE8};
            esp_transport_ws_send_raw(ws, WS_TRANSPORT_OPCODES_CLOSE | WS_TRANSPORT_OPCODES_FIN, code, 2, 1000);
            return 1;
        }
        if (op == WS_TRANSPORT_OPCODES_PING) {
            if (esp_transport_ws_send_raw(ws, WS_TRANSPORT_OPCODES_PONG | WS_TRANSPORT_OPCODES_FIN, rx, n,
                                          SEND_TIMEOUT_MS) < 0) {
                return -1;
            }
        }
        /* TEXT/BINARY/PONG từ Server: hợp đồng không có — bỏ qua */
    }
    return 0;
}

static status_t compute_status(int64_t now, int64_t last_ok_us)
{
    if (last_ok_us != 0 && now - last_ok_us < STREAMING_GRACE_US) {
        return ST_STREAMING;
    }
    switch (atomic_load(&s_source)) {
    case GW_RELAY_SRC_UNAVAILABLE:
        return ST_UNAVAILABLE;
    case GW_RELAY_SRC_CONNECTING:
        return ST_CONNECTING;
    default:
        return last_ok_us != 0 ? ST_UNAVAILABLE : ST_CONNECTING;
    }
}

/* Chạy 1 kết nối tới khi phiên hết hạn/đứt. *streamed = true nếu đã gửi được ít nhất 1 khung. */
static run_result_t pump(conn_t *c, uint32_t gen, bool *streamed)
{
    int64_t last_send_us = 0, last_ok_us = 0, last_status_us = 0, stats_us = esp_timer_get_time();
    int last_status = -1;
    uint32_t sent = 0, sent_bytes = 0;
    atomic_store(&s_dropped, 0);
    atomic_store(&s_offered, 0);

    for (;;) {
        if (!current(gen)) {
            say_goodbye(c->ws);
            return RUN_STOPPED;
        }
        int64_t now = esp_timer_get_time();

        int rx = poll_server(c->ws);
        if (rx > 0) {
            return RUN_SERVER_CLOSED;
        }
        if (rx < 0) {
            return RUN_NET_ERROR;
        }

        const status_t st = compute_status(now, last_ok_us);
        if ((int)st != last_status || (st != ST_STREAMING && now - last_status_us >= STATUS_PERIOD_US)) {
            if (!send_status(c->ws, st)) {
                return RUN_NET_ERROR;
            }
            last_status = (int)st;
            last_status_us = now;
        }

        bool pending_waits = false;
        if (now - last_send_us >= MIN_INTERVAL_US) {
            gw_live_frame_t *f = atomic_exchange(&s_pending, NULL);
            if (f != NULL) {
                const size_t len = f->len;
                memcpy(s_tx, f->data, len);   /* ws che dữ liệu tại chỗ — gửi từ bản riêng, bộ đệm chung còn dùng cho LCD */
                gw_live_frame_release(f);
                last_send_us = now;
                int w = esp_transport_ws_send_raw(c->ws, WS_TRANSPORT_OPCODES_BINARY | WS_TRANSPORT_OPCODES_FIN,
                                                  (const char *)s_tx, (int)len, SEND_TIMEOUT_MS);
                if (w != (int)len) {
                    ESP_LOGW(TAG, "send failed (%d of %u bytes)", w, (unsigned)len);
                    return RUN_NET_ERROR;
                }
                last_ok_us = esp_timer_get_time();
                *streamed = true;
                sent++;
                sent_bytes += (uint32_t)len;
            }
        } else {
            pending_waits = atomic_load(&s_pending) != NULL;
        }

        now = esp_timer_get_time();
        if (now - stats_us >= STATS_US) {
            const int64_t span_ms = (now - stats_us) / 1000;
            ESP_LOGI(TAG, "relay sent %u.%u fps, %u KB/s, offered %u, dropped %u", (unsigned)(sent * 10000 / span_ms / 10),
                     (unsigned)(sent * 10000 / span_ms % 10), (unsigned)(sent_bytes / 1024 * 1000 / span_ms),
                     (unsigned)atomic_exchange(&s_offered, 0), (unsigned)atomic_exchange(&s_dropped, 0));
            stats_us = now;
            sent = 0;
            sent_bytes = 0;
        }

        /* Chờ khung mới / đến hạn gửi tiếp / tới lượt xem tin Server — tối đa WAIT_SLICE_MS. */
        int64_t wait_us = WAIT_SLICE_MS * 1000LL;
        if (pending_waits) {
            int64_t left = MIN_INTERVAL_US - (now - last_send_us);
            if (left > 0 && left < wait_us) {
                wait_us = left;
            }
        }
        ulTaskNotifyTake(pdTRUE, pdMS_TO_TICKS((wait_us + 999) / 1000));
    }
}

/* Chờ ms, ra sớm nếu phiên đổi. */
static void backoff(uint32_t gen, uint32_t ms)
{
    const TickType_t end = xTaskGetTickCount() + pdMS_TO_TICKS(ms);
    while (current(gen)) {
        TickType_t left = end - xTaskGetTickCount();
        if ((int32_t)left <= 0) {
            break;
        }
        ulTaskNotifyTake(pdTRUE, left);
    }
}

/* Phiên tự kết thúc (không phải do gw_app): đánh dấu hết hạn rồi báo gw_app. */
static void finish(uint32_t gen, const char *why)
{
    bool ended = false;
    xSemaphoreTake(s_lock, portMAX_DELAY);
    if (atomic_load(&s_gen) == gen && atomic_load(&s_active)) {
        atomic_store(&s_active, false);
        atomic_fetch_add(&s_gen, 1);
        ended = true;
    }
    xSemaphoreGive(s_lock);
    if (ended) {
        ESP_LOGI(TAG, "remote view ended (%s)", why);
        if (s_on_ended != NULL) {
            s_on_ended(s_ctx);
        }
    }
}

static void serve(const req_t *req, uint32_t gen)
{
    flush_pending();
    int failures = 0;
    ESP_LOGI(TAG, "remote view started");
    while (current(gen)) {
        endpoint_t ep;
        const char *base = gw_api_base_url();
        bool secure = false;
        if (base == NULL || !parse_base(base, &ep) || !gw_tls_uri_allowed(base, "https://", "http://", &secure) ||
            secure != ep.secure) {
            finish(gen, "server URL not allowed");
            return;
        }
        conn_t c = {0};
        int http_status = 0;
        run_result_t r;
        bool streamed = false;
        if (conn_open(&c, &ep, req, &http_status) == 0) {
            ESP_LOGI(TAG, "connected to server (%s)", ep.secure ? "wss" : "ws, DEV plaintext");
            r = pump(&c, gen, &streamed);
            conn_close(&c);
        } else if (http_status == 409 || http_status == 429) {
            /* 409: uplink cũ của cùng phiên còn được coi là sống (tối đa ~3 s sau khi rớt); 429: giới hạn số lần upgrade.
             * Cả hai tạm thời → nối lại 1/2/4 s với ts + chữ ký mới (conn_open ký lại mỗi lần), cùng phiên. */
            ESP_LOGW(TAG, "server busy for the relay session: HTTP %d — will retry", http_status);
            r = RUN_NET_ERROR;
        } else if (http_status >= 400 && http_status < 500) {
            /* 400, 401, 403, 404 (và 4xx khác): cuối cùng, không nối lại */
            ESP_LOGW(TAG, "server rejected the relay session: HTTP %d", http_status);
            r = RUN_REJECTED;
        } else {
            /* transport_ws đã bị tắt log (gw_camera_relay_init) nên báo lỗi ngắn gọn ở đây, không kèm header. */
            ESP_LOGW(TAG, "cannot open the relay connection (upgrade status %d)", http_status);
            r = RUN_NET_ERROR;
        }
        flush_pending();
        if (!current(gen) || r == RUN_STOPPED) {
            return;   /* gw_app đóng hoặc thay phiên */
        }
        if (r == RUN_SERVER_CLOSED) {
            finish(gen, "closed by server");
            return;
        }
        if (r == RUN_REJECTED) {
            finish(gen, "rejected by server");
            return;
        }
        if (streamed) {
            failures = 0;   /* đã chạy được rồi mới đứt → đếm lại từ đầu */
        }
        if (++failures > RETRY_MAX) {
            finish(gen, "network down");
            return;
        }
        ESP_LOGW(TAG, "relay connection lost — retry %d/%d", failures, RETRY_MAX);
        backoff(gen, 1000u << (failures - 1));   /* 1, 2, 4 s */
    }
}

static void relay_task(void *arg)
{
    for (;;) {
        ulTaskNotifyTake(pdTRUE, portMAX_DELAY);
        for (;;) {
            req_t req;
            uint32_t gen;
            xSemaphoreTake(s_lock, portMAX_DELAY);
            const bool active = atomic_load(&s_active);
            req = s_req;
            gen = atomic_load(&s_gen);
            xSemaphoreGive(s_lock);
            if (!active) {
                flush_pending();
                break;
            }
            serve(&req, gen);   /* về khi phiên hết; nếu bị thay bằng phiên mới thì vòng lặp phục vụ tiếp */
        }
    }
}

esp_err_t gw_camera_relay_init(gw_camera_relay_ended_cb on_ended, void *ctx)
{
    ESP_RETURN_ON_FALSE(s_task == NULL, ESP_ERR_INVALID_STATE, TAG, "already started");
    /* Bất biến 2 (không log chữ ký/secret): khi ghi/đọc yêu cầu upgrade lỗi, transport_ws (ESP-IDF 5.4.4,
     * transport_ws.c:283,289) ESP_LOGE in NGUYÊN yêu cầu, gồm X-Signature và X-Session-Id (mức D cũng in headers).
     * Đã kiểm transport_base/esp-tls/transport: chỉ in errno/trạng thái, không in bộ đệm header → chỉ chặn transport_ws.
     * Lỗi kết nối do serve() tự log ngắn gọn. */
    esp_log_level_set("transport_ws", ESP_LOG_NONE);
    s_on_ended = on_ended;
    s_ctx = ctx;
    s_lock = xSemaphoreCreateMutex();
    ESP_RETURN_ON_FALSE(s_lock != NULL, ESP_ERR_NO_MEM, TAG, "mutex");
    s_tx = heap_caps_aligned_alloc(16, GW_CAMERA_LIVE_FRAME_MAX, MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT);
    ESP_RETURN_ON_FALSE(s_tx != NULL, ESP_ERR_NO_MEM, TAG, "send buffer (PSRAM)");
    if (xTaskCreatePinnedToCore(relay_task, "gw_relay", RELAY_TASK_STACK, NULL, RELAY_TASK_PRIO, &s_task,
                                RELAY_TASK_CORE) != pdPASS) {
        free(s_tx);
        s_tx = NULL;
        return ESP_ERR_NO_MEM;
    }
    ESP_LOGI(TAG, "ready (max %d fps)", CONFIG_GW_CAMERA_RELAY_MAX_FPS);
    return ESP_OK;
}
