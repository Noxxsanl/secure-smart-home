#include "drv_relay.h"

#include <stdlib.h>

#include "driver/gpio.h"
#include "esp_check.h"
#include "esp_timer.h"
#include "freertos/FreeRTOS.h"
#include "freertos/semphr.h"

static const char *TAG = "drv_relay";

#define RELAY_DEFAULT_INTERVAL_MS 200

typedef struct {
    int gpio;
    bool active_high;
    bool on;
    int64_t last_switch_us;
} relay_ch_t;

struct drv_relay {
    relay_ch_t ch[DRV_RELAY_MAX_CHANNELS];
    size_t count;
    int64_t min_interval_us;
    SemaphoreHandle_t lock;
};

static inline int level_for(const relay_ch_t *c, bool on)
{
    return (on == c->active_high) ? 1 : 0;
}

static bool is_strapping_pin(int gpio)
{
    /* ESP32-S3: GPIO0, 3, 45, 46 quyết định chế độ khởi động — relay trên các chân này có thể đóng nhầm. */
    return gpio == 0 || gpio == 3 || gpio == 45 || gpio == 46;
}

esp_err_t drv_relay_init(const drv_relay_config_t *cfg, drv_relay_handle_t *out)
{
    ESP_RETURN_ON_FALSE(cfg && out && cfg->channels, ESP_ERR_INVALID_ARG, TAG, "null arg");
    ESP_RETURN_ON_FALSE(cfg->count > 0 && cfg->count <= DRV_RELAY_MAX_CHANNELS, ESP_ERR_INVALID_ARG, TAG,
                        "count must be 1..%d", DRV_RELAY_MAX_CHANNELS);
    for (size_t i = 0; i < cfg->count; i++) {
        ESP_RETURN_ON_FALSE(GPIO_IS_VALID_OUTPUT_GPIO(cfg->channels[i].gpio), ESP_ERR_INVALID_ARG, TAG,
                            "channel %u: invalid gpio %d", (unsigned)i, cfg->channels[i].gpio);
    }

    struct drv_relay *h = calloc(1, sizeof(*h));
    ESP_RETURN_ON_FALSE(h, ESP_ERR_NO_MEM, TAG, "no mem");
    h->lock = xSemaphoreCreateMutex();
    if (h->lock == NULL) {
        free(h);
        return ESP_ERR_NO_MEM;
    }
    h->count = cfg->count;
    h->min_interval_us =
        (int64_t)(cfg->min_switch_interval_ms ? cfg->min_switch_interval_ms : RELAY_DEFAULT_INTERVAL_MS) * 1000;

    for (size_t i = 0; i < cfg->count; i++) {
        relay_ch_t *c = &h->ch[i];
        c->gpio = cfg->channels[i].gpio;
        c->active_high = cfg->channels[i].active_high;
        c->on = false;
        if (is_strapping_pin(c->gpio)) {
            ESP_LOGW(TAG, "channel %u on strapping GPIO %d — relay may click during boot", (unsigned)i, c->gpio);
        }
        /* Không dùng gpio_reset_pin(): hàm đó bật pull-up → relay kích mức thấp sẽ đóng. */
        gpio_set_level(c->gpio, level_for(c, false));
        gpio_config_t io = {
            .pin_bit_mask = 1ULL << c->gpio,
            .mode = GPIO_MODE_OUTPUT,
            .pull_up_en = GPIO_PULLUP_DISABLE,
            .pull_down_en = GPIO_PULLDOWN_DISABLE,
            .intr_type = GPIO_INTR_DISABLE,
        };
        esp_err_t err = gpio_config(&io);
        if (err != ESP_OK) {
            ESP_LOGE(TAG, "channel %u gpio config failed: %s", (unsigned)i, esp_err_to_name(err));
            vSemaphoreDelete(h->lock);
            free(h);
            return err;
        }
        gpio_set_level(c->gpio, level_for(c, false));
    }

    *out = h;
    ESP_LOGI(TAG, "%u relay channel(s) ready, all OFF", (unsigned)h->count);
    return ESP_OK;
}

/* Gọi khi đã giữ h->lock. */
static esp_err_t set_locked(struct drv_relay *h, size_t ch, bool on)
{
    relay_ch_t *c = &h->ch[ch];
    if (c->on == on) {
        return ESP_OK;
    }
    int64_t now = esp_timer_get_time();
    if (c->last_switch_us != 0 && now - c->last_switch_us < h->min_interval_us) {
        return ESP_ERR_INVALID_STATE;
    }
    gpio_set_level(c->gpio, level_for(c, on));
    c->on = on;
    c->last_switch_us = now;
    return ESP_OK;
}

static void log_result(size_t ch, bool on, esp_err_t err)
{
    if (err == ESP_OK) {
        ESP_LOGI(TAG, "relay %u %s", (unsigned)ch, on ? "ON" : "OFF");
    } else {
        ESP_LOGW(TAG, "relay %u switching too fast, ignored", (unsigned)ch);
    }
}

esp_err_t drv_relay_set(drv_relay_handle_t h, size_t ch, bool on)
{
    ESP_RETURN_ON_FALSE(h && ch < h->count, ESP_ERR_INVALID_ARG, TAG, "bad channel");
    xSemaphoreTake(h->lock, portMAX_DELAY);
    esp_err_t err = set_locked(h, ch, on);
    xSemaphoreGive(h->lock);
    log_result(ch, on, err);
    return err;
}

esp_err_t drv_relay_toggle(drv_relay_handle_t h, size_t ch, bool *new_state)
{
    ESP_RETURN_ON_FALSE(h && ch < h->count, ESP_ERR_INVALID_ARG, TAG, "bad channel");
    xSemaphoreTake(h->lock, portMAX_DELAY);
    bool target = !h->ch[ch].on;
    esp_err_t err = set_locked(h, ch, target);
    bool state = h->ch[ch].on;
    xSemaphoreGive(h->lock);
    log_result(ch, target, err);
    if (new_state) {
        *new_state = state;
    }
    return err;
}

esp_err_t drv_relay_get(drv_relay_handle_t h, size_t ch, bool *on)
{
    ESP_RETURN_ON_FALSE(h && on && ch < h->count, ESP_ERR_INVALID_ARG, TAG, "bad channel");
    *on = h->ch[ch].on;
    return ESP_OK;
}

esp_err_t drv_relay_all_off(drv_relay_handle_t h)
{
    ESP_RETURN_ON_FALSE(h, ESP_ERR_INVALID_ARG, TAG, "null arg");
    xSemaphoreTake(h->lock, portMAX_DELAY);
    int64_t now = esp_timer_get_time();
    for (size_t i = 0; i < h->count; i++) {
        relay_ch_t *c = &h->ch[i];
        gpio_set_level(c->gpio, level_for(c, false));
        if (c->on) {
            c->on = false;
            c->last_switch_us = now;
        }
    }
    xSemaphoreGive(h->lock);
    ESP_LOGW(TAG, "all relays OFF");
    return ESP_OK;
}

size_t drv_relay_count(drv_relay_handle_t h)
{
    return h ? h->count : 0;
}

esp_err_t drv_relay_del(drv_relay_handle_t h)
{
    if (h == NULL) {
        return ESP_ERR_INVALID_ARG;
    }
    drv_relay_all_off(h);
    vSemaphoreDelete(h->lock);
    free(h);
    return ESP_OK;
}
