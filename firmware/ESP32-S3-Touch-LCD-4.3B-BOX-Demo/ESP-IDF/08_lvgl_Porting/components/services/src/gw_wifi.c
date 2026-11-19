#include "gw_wifi.h"

#include <stdatomic.h>
#include <stdio.h>
#include <string.h>

#include "esp_check.h"
#include "esp_event.h"
#include "esp_log.h"
#include "esp_mac.h"
#include "esp_netif.h"
#include "esp_timer.h"
#include "esp_wifi.h"
#include "mbedtls/platform_util.h"
#include "sdkconfig.h"

static const char *TAG = "gw_wifi";

#define RETRY_MIN_MS 1000
#define RETRY_MAX_MS 30000

static esp_netif_t *s_sta_netif;
static esp_netif_t *s_ap_netif;
static esp_timer_handle_t s_retry_timer;
static uint32_t s_retry_ms = RETRY_MIN_MS;
static bool s_has_router;
static atomic_bool s_sta_connected;
static gw_wifi_state_cb_t s_on_state;
static void *s_ctx;

static void retry_connect(void *arg)
{
    esp_err_t err = esp_wifi_connect();
    if (err != ESP_OK) {
        ESP_LOGW(TAG, "connect failed: %s", esp_err_to_name(err));
    }
}

static void schedule_retry(void)
{
    ESP_LOGI(TAG, "router not reachable, retry in %u ms", (unsigned)s_retry_ms);
    esp_timer_stop(s_retry_timer);
    esp_timer_start_once(s_retry_timer, (uint64_t)s_retry_ms * 1000);
    s_retry_ms = (s_retry_ms * 2 > RETRY_MAX_MS) ? RETRY_MAX_MS : s_retry_ms * 2;
}

static void notify(bool connected)
{
    if (s_on_state) {
        s_on_state(connected, s_ctx);
    }
}

static void on_wifi_event(void *arg, esp_event_base_t base, int32_t id, void *data)
{
    switch (id) {
    case WIFI_EVENT_STA_START:
        if (s_has_router) {
            esp_wifi_connect();
        }
        break;
    case WIFI_EVENT_STA_DISCONNECTED: {
        const wifi_event_sta_disconnected_t *d = data;
        bool was = atomic_exchange(&s_sta_connected, false);
        ESP_LOGW(TAG, "router disconnected (reason %d)", d ? d->reason : -1);
        if (was) {
            notify(false);
        }
        if (s_has_router) {
            schedule_retry();
        }
        break;
    }
    case WIFI_EVENT_AP_STACONNECTED: {
        const wifi_event_ap_staconnected_t *e = data;
        ESP_LOGI(TAG, "local AP: client " MACSTR " joined", MAC2STR(e->mac));
        break;
    }
    case WIFI_EVENT_AP_STADISCONNECTED: {
        const wifi_event_ap_stadisconnected_t *e = data;
        ESP_LOGI(TAG, "local AP: client " MACSTR " left", MAC2STR(e->mac));
        break;
    }
    default:
        break;
    }
}

static void on_ip_event(void *arg, esp_event_base_t base, int32_t id, void *data)
{
    if (id == IP_EVENT_STA_GOT_IP) {
        const ip_event_got_ip_t *e = data;
        s_retry_ms = RETRY_MIN_MS;
        atomic_store(&s_sta_connected, true);
        ESP_LOGI(TAG, "router connected, ip=" IPSTR ", channel %u", IP2STR(&e->ip_info.ip), gw_wifi_channel());
        notify(true);
    }
}

esp_err_t gw_wifi_start(const gw_config_t *cfg, gw_wifi_state_cb_t on_state, void *ctx)
{
    ESP_RETURN_ON_FALSE(cfg, ESP_ERR_INVALID_ARG, TAG, "null cfg");
    s_on_state = on_state;
    s_ctx = ctx;
    s_has_router = cfg->has_wifi;

    s_sta_netif = esp_netif_create_default_wifi_sta();
    s_ap_netif = esp_netif_create_default_wifi_ap();
    ESP_RETURN_ON_FALSE(s_sta_netif && s_ap_netif, ESP_ERR_NO_MEM, TAG, "netif");

    const esp_timer_create_args_t targs = {.callback = retry_connect, .name = "wifi_retry"};
    ESP_RETURN_ON_ERROR(esp_timer_create(&targs, &s_retry_timer), TAG, "retry timer");

    wifi_init_config_t init = WIFI_INIT_CONFIG_DEFAULT();
    ESP_RETURN_ON_ERROR(esp_wifi_init(&init), TAG, "esp_wifi_init");
    ESP_RETURN_ON_ERROR(esp_wifi_set_storage(WIFI_STORAGE_RAM), TAG, "storage");
    ESP_RETURN_ON_ERROR(esp_event_handler_register(WIFI_EVENT, ESP_EVENT_ANY_ID, on_wifi_event, NULL), TAG, "evt");
    ESP_RETURN_ON_ERROR(esp_event_handler_register(IP_EVENT, IP_EVENT_STA_GOT_IP, on_ip_event, NULL), TAG, "ip evt");
    /* AP+STA kể cả khi chưa có router: peer ESP-NOW gắn với interface STA (Node/Camera gửi tới MAC Station). */
    ESP_RETURN_ON_ERROR(esp_wifi_set_mode(WIFI_MODE_APSTA), TAG, "mode");

    wifi_config_t ap = {0};
    strlcpy((char *)ap.ap.ssid, cfg->ap_ssid, sizeof(ap.ap.ssid));
    ap.ap.ssid_len = (uint8_t)strlen(cfg->ap_ssid);
    strlcpy((char *)ap.ap.password, cfg->ap_password, sizeof(ap.ap.password));
    ap.ap.channel = CONFIG_GW_LOCAL_AP_CHANNEL;
    ap.ap.authmode = WIFI_AUTH_WPA2_PSK;
    ap.ap.max_connection = CONFIG_GW_LOCAL_AP_MAX_CONN;
    ap.ap.pmf_cfg.capable = true;
    esp_err_t err = esp_wifi_set_config(WIFI_IF_AP, &ap);
    mbedtls_platform_zeroize(&ap, sizeof(ap));
    ESP_RETURN_ON_ERROR(err, TAG, "AP config");

    if (s_has_router) {
        wifi_config_t sta = {0};
        strlcpy((char *)sta.sta.ssid, cfg->wifi_ssid, sizeof(sta.sta.ssid));
        strlcpy((char *)sta.sta.password, cfg->wifi_password, sizeof(sta.sta.password));
        /* Mật khẩu rỗng = mạng mở; còn lại không chấp nhận AP yếu hơn WPA2 (chống AP giả hạ cấp). */
        sta.sta.threshold.authmode = cfg->wifi_password[0] ? WIFI_AUTH_WPA2_PSK : WIFI_AUTH_OPEN;
        sta.sta.pmf_cfg.capable = true;
        err = esp_wifi_set_config(WIFI_IF_STA, &sta);
        mbedtls_platform_zeroize(&sta, sizeof(sta));
        ESP_RETURN_ON_ERROR(err, TAG, "STA config");
    } else {
        ESP_LOGW(TAG, "no router configured (NVS wifi/ssid) — local AP only, server unreachable");
    }

    ESP_RETURN_ON_ERROR(esp_wifi_start(), TAG, "esp_wifi_start");
    /* Không tiết kiệm năng lượng: modem ngủ sẽ lỡ gói ESP-NOW của node. */
    esp_wifi_set_ps(WIFI_PS_NONE);

    uint8_t mac[6];
    gw_wifi_sta_mac(mac);
    ESP_LOGI(TAG, "local AP \"%s\" on channel %u; gateway STA MAC " MACSTR " (pairing/gateway_mac of nodes)",
             cfg->ap_ssid, gw_wifi_channel(), MAC2STR(mac));
    return ESP_OK;
}

bool gw_wifi_sta_connected(void)
{
    return atomic_load(&s_sta_connected);
}

bool gw_wifi_sta_ip(char *buf, size_t cap)
{
    esp_netif_ip_info_t ip;
    if (!atomic_load(&s_sta_connected) || s_sta_netif == NULL || esp_netif_get_ip_info(s_sta_netif, &ip) != ESP_OK) {
        return false;
    }
    snprintf(buf, cap, IPSTR, IP2STR(&ip.ip));
    return true;
}

bool gw_wifi_ap_ip(esp_ip4_addr_t *out)
{
    esp_netif_ip_info_t ip;
    if (s_ap_netif == NULL || esp_netif_get_ip_info(s_ap_netif, &ip) != ESP_OK) {
        return false;
    }
    *out = ip.ip;
    return true;
}

bool gw_wifi_ap_client_ip(const uint8_t mac[6], esp_ip4_addr_t *out)
{
    if (s_ap_netif == NULL || mac == NULL || out == NULL) {
        return false;
    }
    /* Lease DHCP còn giữ sau khi thiết bị rời AP → chỉ tin khi thiết bị đang kết nối. */
    wifi_sta_list_t list;
    if (esp_wifi_ap_get_sta_list(&list) != ESP_OK) {
        return false;
    }
    bool associated = false;
    for (int i = 0; i < list.num && !associated; i++) {
        associated = memcmp(list.sta[i].mac, mac, 6) == 0;
    }
    if (!associated) {
        return false;
    }
    esp_netif_pair_mac_ip_t pair = {0};
    memcpy(pair.mac, mac, sizeof(pair.mac));
    if (esp_netif_dhcps_get_clients_by_mac(s_ap_netif, 1, &pair) != ESP_OK || pair.ip.addr == 0) {
        return false;
    }
    *out = pair.ip;
    return true;
}

bool gw_wifi_rssi(int *rssi)
{
    wifi_ap_record_t ap;
    if (!atomic_load(&s_sta_connected) || esp_wifi_sta_get_ap_info(&ap) != ESP_OK) {
        return false;
    }
    *rssi = ap.rssi;
    return true;
}

uint8_t gw_wifi_channel(void)
{
    uint8_t primary = 0;
    wifi_second_chan_t second;
    if (esp_wifi_get_channel(&primary, &second) != ESP_OK) {
        return 0;
    }
    return primary;
}

void gw_wifi_sta_mac(uint8_t mac[6])
{
    if (esp_wifi_get_mac(WIFI_IF_STA, mac) != ESP_OK) {
        esp_read_mac(mac, ESP_MAC_WIFI_STA);
    }
}
