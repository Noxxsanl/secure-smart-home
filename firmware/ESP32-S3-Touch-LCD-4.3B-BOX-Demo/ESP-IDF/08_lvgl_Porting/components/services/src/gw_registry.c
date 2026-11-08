#include "gw_registry.h"

#include <ctype.h>
#include <stdio.h>
#include <string.h>

#include "esp_log.h"
#include "esp_mac.h"
#include "esp_timer.h"
#include "freertos/FreeRTOS.h"
#include "freertos/semphr.h"
#include "gw_config.h"
#include "gw_time.h"
#include "mbedtls/platform_util.h"
#include "nvs.h"
#include "sdkconfig.h"

static const char *TAG = "gw_registry";

#define NS "nodes"
#define SEEN_NS "seen"                 /* "lần cuối thấy" của từng thiết bị — không bí mật */
#define SEEN_SAVE_EVERY_S 300          /* thiết bị đang trực tuyến: ghi NVS tối đa 5 phút/lần */
#define SECRET_MAX 128
#define OFFLINE_US ((int64_t)CONFIG_GW_NODE_OFFLINE_S * 1000 * 1000)

typedef struct {
    gw_device_info_t info;
    char secret[SECRET_MAX + 1];
    uint8_t lmk[GW_LMK_LEN];
} entry_t;

/* Ghi 1 lần trong gw_registry_load, sau đó chỉ đọc (kể cả từ callback ESP-NOW trong task WiFi). */
static entry_t s_entries[GW_REGISTRY_MAX];
static size_t s_count;

/* Trạng thái chạy — dưới s_status_lock. */
static gw_device_status_t s_status[GW_REGISTRY_MAX];
static int64_t s_seen_saved[GW_REGISTRY_MAX];   /* giờ unix đã có trong NVS (đọc lúc load hoặc vừa ghi) */
static SemaphoreHandle_t s_status_lock;

/* FNV-1a 32 bit — chỉ để nhận ra khoá "s<i>" còn thuộc đúng thiết bị, không phải bảo mật. */
static uint32_t id_hash(const char *s)
{
    uint32_t h = 2166136261u;
    for (; *s; s++) {
        h = (h ^ (uint8_t)*s) * 16777619u;
    }
    return h;
}

/* Đọc "lần cuối thấy" đã lưu; bỏ qua mục không khớp device_id hiện tại (danh sách nodes đã đổi). */
static void load_seen(void)
{
    nvs_handle_t h;
    if (nvs_open(SEEN_NS, NVS_READONLY, &h) != ESP_OK) {
        return;   /* lần đầu chạy: chưa có namespace */
    }
    for (size_t i = 0; i < s_count; i++) {
        char key[16];   /* khoá NVS ≤ 15 ký tự */
        uint32_t hash = 0;
        int64_t ts = 0;
        snprintf(key, sizeof(key), "h%u", (unsigned)i);
        if (nvs_get_u32(h, key, &hash) != ESP_OK || hash != id_hash(s_entries[i].info.device_id)) {
            continue;
        }
        snprintf(key, sizeof(key), "s%u", (unsigned)i);
        if (nvs_get_i64(h, key, &ts) == ESP_OK && ts > 0) {
            s_seen_saved[i] = ts;
        }
    }
    nvs_close(h);
}

static int hex_val(char c)
{
    if (c >= '0' && c <= '9') return c - '0';
    c = (char)tolower((unsigned char)c);
    if (c >= 'a' && c <= 'f') return c - 'a' + 10;
    return -1;
}

static bool parse_hex(const char *s, uint8_t *out, size_t n)
{
    if (strlen(s) != n * 2) {
        return false;
    }
    for (size_t i = 0; i < n; i++) {
        int hi = hex_val(s[2 * i]);
        int lo = hex_val(s[2 * i + 1]);
        if (hi < 0 || lo < 0) {
            return false;
        }
        out[i] = (uint8_t)((hi << 4) | lo);
    }
    return true;
}

static bool parse_mac(const char *s, uint8_t mac[6])
{
    unsigned int b[6];
    char tail;
    if (sscanf(s, "%2x:%2x:%2x:%2x:%2x:%2x%c", &b[0], &b[1], &b[2], &b[3], &b[4], &b[5], &tail) != 6) {
        return false;
    }
    for (int i = 0; i < 6; i++) {
        mac[i] = (uint8_t)b[i];
    }
    return (mac[0] & 0x01) == 0;   /* broadcast/multicast không thể là peer unicast mã hoá */
}

static bool all_zero(const uint8_t *p, size_t n)
{
    uint8_t acc = 0;
    for (size_t i = 0; i < n; i++) {
        acc |= p[i];
    }
    return acc == 0;
}

static esp_err_t get_str(nvs_handle_t h, unsigned i, const char *field, char *buf, size_t cap)
{
    char key[16];
    snprintf(key, sizeof(key), "%u_%s", i, field);
    size_t len = cap;
    esp_err_t err = nvs_get_str(h, key, buf, &len);
    if (err == ESP_OK && buf[0] == '\0') {
        err = ESP_ERR_NOT_FOUND;
    }
    if (err != ESP_OK) {
        buf[0] = '\0';
    }
    return err;
}

/* Đọc mục i vào e. Log TÊN trường lỗi, không log secret/LMK. */
static bool load_entry(nvs_handle_t h, unsigned i, entry_t *e, const char *gateway_id)
{
    char buf[40];
    memset(e, 0, sizeof(*e));

    if (get_str(h, i, "kind", buf, sizeof(buf)) != ESP_OK) {
        ESP_LOGW(TAG, "entry %u: missing kind", i);
        return false;
    }
    if (strcmp(buf, "node") == 0) {
        e->info.kind = GW_DEV_NODE;
    } else if (strcmp(buf, "camera") == 0) {
        e->info.kind = GW_DEV_CAMERA;
    } else {
        ESP_LOGW(TAG, "entry %u: kind must be node|camera", i);
        return false;
    }
    if (get_str(h, i, "id", e->info.device_id, sizeof(e->info.device_id)) != ESP_OK ||
        !gw_valid_id(e->info.device_id, GW_DEVICE_ID_MAX)) {
        ESP_LOGW(TAG, "entry %u: missing/unsafe id (allowed: A-Z a-z 0-9 _ -)", i);
        return false;
    }
    if (strcmp(e->info.device_id, gateway_id) == 0) {
        ESP_LOGW(TAG, "entry %u: id equals gateway_id", i);
        return false;
    }
    if (get_str(h, i, "secret", e->secret, sizeof(e->secret)) != ESP_OK) {
        ESP_LOGW(TAG, "entry %u (%s): missing secret", i, e->info.device_id);
        return false;
    }
    if (get_str(h, i, "mac", buf, sizeof(buf)) != ESP_OK || !parse_mac(buf, e->info.mac)) {
        ESP_LOGW(TAG, "entry %u (%s): missing/malformed mac (unicast AA:BB:CC:DD:EE:FF)", i, e->info.device_id);
        mbedtls_platform_zeroize(e->secret, sizeof(e->secret));
        return false;
    }
    if (get_str(h, i, "lmk", buf, sizeof(buf)) == ESP_OK) {
        e->info.has_lmk = parse_hex(buf, e->lmk, GW_LMK_LEN) && !all_zero(e->lmk, GW_LMK_LEN);
        if (!e->info.has_lmk) {
            ESP_LOGW(TAG, "entry %u (%s): lmk malformed or all-zero (expect 32 hex)", i, e->info.device_id);
            mbedtls_platform_zeroize(e->lmk, sizeof(e->lmk));
        }
    }
    mbedtls_platform_zeroize(buf, sizeof(buf));
    return true;
}

esp_err_t gw_registry_load(const char *gateway_id)
{
    if (s_status_lock == NULL) {
        s_status_lock = xSemaphoreCreateMutex();
        if (s_status_lock == NULL) {
            return ESP_ERR_NO_MEM;
        }
    }
    for (size_t i = 0; i < s_count; i++) {
        mbedtls_platform_zeroize(&s_entries[i], sizeof(s_entries[i]));
    }
    s_count = 0;
    memset(s_status, 0, sizeof(s_status));
    memset(s_seen_saved, 0, sizeof(s_seen_saved));

    nvs_handle_t h;
    if (nvs_open(NS, NVS_READONLY, &h) != ESP_OK) {
        ESP_LOGW(TAG, "namespace %s not found — no paired node/camera", NS);
        return ESP_OK;
    }
    uint8_t count = 0;
    nvs_get_u8(h, "count", &count);
    if (count > GW_REGISTRY_MAX) {
        ESP_LOGW(TAG, "count=%u > %d — extra entries ignored", count, GW_REGISTRY_MAX);
        count = GW_REGISTRY_MAX;
    }

    for (unsigned i = 0; i < count; i++) {
        entry_t e;
        if (!load_entry(h, i, &e, gateway_id ? gateway_id : "")) {
            continue;
        }
        bool dup = false;
        for (size_t j = 0; j < s_count; j++) {
            if (memcmp(s_entries[j].info.mac, e.info.mac, 6) == 0 ||
                strcmp(s_entries[j].info.device_id, e.info.device_id) == 0) {
                dup = true;
            }
        }
        if (dup) {
            ESP_LOGW(TAG, "entry %u (%s): duplicate mac/id — ignored", i, e.info.device_id);
        } else {
            s_entries[s_count++] = e;
            ESP_LOGI(TAG, "%s %s mac=" MACSTR " lmk=%s", e.info.kind == GW_DEV_CAMERA ? "camera" : "node",
                     e.info.device_id, MAC2STR(e.info.mac), e.info.has_lmk ? "set" : "none");
        }
        mbedtls_platform_zeroize(&e, sizeof(e));
    }
    nvs_close(h);
    load_seen();
    ESP_LOGI(TAG, "%u paired device(s)", (unsigned)s_count);
    return ESP_OK;
}

size_t gw_registry_count(void)
{
    return s_count;
}

const gw_device_info_t *gw_registry_get(size_t idx)
{
    return idx < s_count ? &s_entries[idx].info : NULL;
}

int gw_registry_find_mac(const uint8_t mac[6])
{
    for (size_t i = 0; i < s_count; i++) {
        if (memcmp(s_entries[i].info.mac, mac, 6) == 0) {
            return (int)i;
        }
    }
    return -1;
}

int gw_registry_find_id(const char *device_id)
{
    if (device_id == NULL) {
        return -1;
    }
    for (size_t i = 0; i < s_count; i++) {
        if (strcmp(s_entries[i].info.device_id, device_id) == 0) {
            return (int)i;
        }
    }
    return -1;
}

sm_verify_result_t gw_registry_verify(size_t idx, int64_t ts, const char *sig_hex, int64_t now)
{
    if (idx >= s_count) {
        return SM_VERIFY_BAD_INPUT;
    }
    return sm_device_verify(s_entries[idx].secret, s_entries[idx].info.device_id, ts, sig_hex, now);
}

esp_err_t gw_registry_sign(size_t idx, int64_t ts, char out_hex[SM_HMAC_HEX_LEN + 1])
{
    if (idx >= s_count) {
        return ESP_ERR_INVALID_ARG;
    }
    return sm_device_sign(s_entries[idx].secret, s_entries[idx].info.device_id, ts, out_hex);
}

bool gw_registry_copy_lmk(size_t idx, uint8_t out[GW_LMK_LEN])
{
    if (idx >= s_count || !s_entries[idx].info.has_lmk) {
        return false;
    }
    memcpy(out, s_entries[idx].lmk, GW_LMK_LEN);
    return true;
}

void gw_registry_touch(size_t idx, int rssi)
{
    if (idx >= s_count) {
        return;
    }
    xSemaphoreTake(s_status_lock, portMAX_DELAY);
    s_status[idx].last_seen_us = esp_timer_get_time();
    s_status[idx].rssi = rssi;
    xSemaphoreGive(s_status_lock);
}

void gw_registry_set_heartbeat(size_t idx, uint32_t uptime_s, const char *fw_version)
{
    if (idx >= s_count) {
        return;
    }
    xSemaphoreTake(s_status_lock, portMAX_DELAY);
    s_status[idx].uptime_s = uptime_s;
    if (fw_version != NULL) {
        strlcpy(s_status[idx].fw_version, fw_version, sizeof(s_status[idx].fw_version));
    }
    xSemaphoreGive(s_status_lock);
}

bool gw_registry_status(size_t idx, gw_device_status_t *out)
{
    if (idx >= s_count || out == NULL) {
        return false;
    }
    xSemaphoreTake(s_status_lock, portMAX_DELAY);
    *out = s_status[idx];
    const int64_t saved = s_seen_saved[idx];
    xSemaphoreGive(s_status_lock);
    const int64_t now_us = esp_timer_get_time();
    out->online = out->last_seen_us != 0 && now_us - out->last_seen_us < OFFLINE_US;
    int64_t now;
    if (out->last_seen_us != 0 && gw_time_now(&now)) {
        out->last_seen_unix = now - (now_us - out->last_seen_us) / 1000000;   /* thấy từ lúc khởi động */
    } else {
        out->last_seen_unix = saved;   /* trước lần khởi động này (hoặc chưa có giờ để đổi) */
    }
    return true;
}

void gw_registry_save_seen(bool force)
{
    int64_t now;
    if (s_status_lock == NULL || !gw_time_now(&now)) {
        return;   /* chưa có giờ unix để lưu */
    }
    nvs_handle_t h = 0;
    bool opened = false;
    for (size_t i = 0; i < s_count; i++) {
        gw_device_status_t st;
        gw_registry_status(i, &st);
        xSemaphoreTake(s_status_lock, portMAX_DELAY);
        const int64_t saved = s_seen_saved[i];
        xSemaphoreGive(s_status_lock);
        const int64_t ts = st.last_seen_unix;
        if (st.last_seen_us == 0 || ts <= saved) {
            continue;   /* chưa thấy từ lúc khởi động, hoặc NVS đã có mốc này */
        }
        if (!force && st.online && ts - saved < SEEN_SAVE_EVERY_S) {
            continue;   /* đang trực tuyến: chờ đủ 5 phút mới ghi — đỡ mòn flash */
        }
        if (!opened) {
            if (nvs_open(SEEN_NS, NVS_READWRITE, &h) != ESP_OK) {
                ESP_LOGW(TAG, "cannot open NVS namespace %s", SEEN_NS);
                return;
            }
            opened = true;
        }
        char key[16];   /* khoá NVS ≤ 15 ký tự */
        const uint32_t hash = id_hash(s_entries[i].info.device_id);
        uint32_t old_hash = 0;
        snprintf(key, sizeof(key), "h%u", (unsigned)i);
        esp_err_t err = ESP_OK;
        if (nvs_get_u32(h, key, &old_hash) != ESP_OK || old_hash != hash) {
            err = nvs_set_u32(h, key, hash);
        }
        snprintf(key, sizeof(key), "s%u", (unsigned)i);
        if (err == ESP_OK) {
            err = nvs_set_i64(h, key, ts);
        }
        if (err == ESP_OK) {
            xSemaphoreTake(s_status_lock, portMAX_DELAY);
            s_seen_saved[i] = ts;
            xSemaphoreGive(s_status_lock);
        } else {
            ESP_LOGW(TAG, "save last-seen of %s: %s", s_entries[i].info.device_id, esp_err_to_name(err));
        }
    }
    if (opened) {
        nvs_commit(h);
        nvs_close(h);
    }
}
