#include "cam_wifi.h"

#include <inttypes.h>
#include <stdio.h>
#include <string.h>

#include "esp_event.h"
#include "esp_log.h"
#include "esp_netif.h"
#include "esp_timer.h"
#include "esp_wifi.h"
#include "freertos/event_groups.h"

static const char *TAG = "cam_wifi";

#define CONNECTED_BIT BIT0
#define BACKOFF_MAX_MS 30000

static EventGroupHandle_t s_events;
static esp_timer_handle_t s_retry_timer;
static uint32_t s_backoff_ms = 1000;
static esp_ip4_addr_t s_gw_ip;

static void retry_connect(void *arg)
{
    esp_wifi_connect();
}

static void on_wifi_event(void *arg, esp_event_base_t base, int32_t id, void *data)
{
    if (base == WIFI_EVENT && id == WIFI_EVENT_STA_START) {
        esp_wifi_connect();
    } else if (base == WIFI_EVENT && id == WIFI_EVENT_STA_DISCONNECTED) {
        const wifi_event_sta_disconnected_t *ev = data;
        xEventGroupClearBits(s_events, CONNECTED_BIT);
        ESP_LOGW(TAG, "disconnected (reason %d), retry in %" PRIu32 " ms", ev->reason, s_backoff_ms);
        esp_timer_stop(s_retry_timer);
        esp_timer_start_once(s_retry_timer, (uint64_t)s_backoff_ms * 1000);
        s_backoff_ms = (s_backoff_ms * 2 > BACKOFF_MAX_MS) ? BACKOFF_MAX_MS : s_backoff_ms * 2;
        /* TODO(FR-4.6, Provisioning §15): quá N lần thì nháy LED báo lỗi; mất ghép nối thì chờ PAIR_REQUEST. */
    } else if (base == IP_EVENT && id == IP_EVENT_STA_GOT_IP) {
        const ip_event_got_ip_t *ev = data;
        s_gw_ip = ev->ip_info.gw;
        s_backoff_ms = 1000;
        ESP_LOGI(TAG, "connected, ip=" IPSTR " gateway=" IPSTR, IP2STR(&ev->ip_info.ip), IP2STR(&ev->ip_info.gw));
        xEventGroupSetBits(s_events, CONNECTED_BIT);
    }
}

esp_err_t cam_wifi_start(const char *ssid, const char *password)
{
    s_events = xEventGroupCreate();
    if (s_events == NULL) {
        return ESP_ERR_NO_MEM;
    }

    const esp_timer_create_args_t targs = {.callback = retry_connect, .name = "wifi_retry"};
    ESP_ERROR_CHECK(esp_timer_create(&targs, &s_retry_timer));

    esp_netif_create_default_wifi_sta();
    wifi_init_config_t init = WIFI_INIT_CONFIG_DEFAULT();
    ESP_ERROR_CHECK(esp_wifi_init(&init));
    ESP_ERROR_CHECK(esp_event_handler_register(WIFI_EVENT, ESP_EVENT_ANY_ID, on_wifi_event, NULL));
    ESP_ERROR_CHECK(esp_event_handler_register(IP_EVENT, IP_EVENT_STA_GOT_IP, on_wifi_event, NULL));

    wifi_config_t cfg = {0};
    strlcpy((char *)cfg.sta.ssid, ssid, sizeof(cfg.sta.ssid));
    strlcpy((char *)cfg.sta.password, password, sizeof(cfg.sta.password));
    cfg.sta.threshold.authmode = WIFI_AUTH_WPA2_PSK;   /* không nối AP mở / WEP */

    ESP_ERROR_CHECK(esp_wifi_set_storage(WIFI_STORAGE_RAM));   /* mật khẩu chỉ nằm ở NVS namespace "wifi" */
    ESP_ERROR_CHECK(esp_wifi_set_mode(WIFI_MODE_STA));
    ESP_ERROR_CHECK(esp_wifi_set_config(WIFI_IF_STA, &cfg));
    memset(&cfg, 0, sizeof(cfg));
    ESP_ERROR_CHECK(esp_wifi_start());
    /* Tắt tiết kiệm điện: luồng MJPEG và ESP-NOW cần radio luôn thức. */
    esp_wifi_set_ps(WIFI_PS_NONE);

    ESP_LOGI(TAG, "connecting to local AP \"%s\"", ssid);
    return ESP_OK;
}

bool cam_wifi_is_connected(void)
{
    return s_events && (xEventGroupGetBits(s_events) & CONNECTED_BIT);
}

bool cam_wifi_wait_connected(TickType_t timeout)
{
    return s_events &&
           (xEventGroupWaitBits(s_events, CONNECTED_BIT, pdFALSE, pdTRUE, timeout) & CONNECTED_BIT);
}

bool cam_wifi_gateway_ip(char *buf, size_t cap)
{
    if (!cam_wifi_is_connected() || s_gw_ip.addr == 0) {
        return false;
    }
    snprintf(buf, cap, IPSTR, IP2STR(&s_gw_ip));
    return true;
}

bool cam_wifi_rssi(int *rssi)
{
    return cam_wifi_is_connected() && esp_wifi_sta_get_rssi(rssi) == ESP_OK;
}
