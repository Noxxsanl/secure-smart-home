#include "drv_ir_rx.h"

#include <stdlib.h>

#include "driver/rmt_rx.h"
#include "esp_attr.h"
#include "esp_check.h"
#include "esp_heap_caps.h"
#include "freertos/FreeRTOS.h"
#include "freertos/queue.h"

static const char *TAG = "drv_ir_rx";

#define IR_RESOLUTION_HZ 1000000          /* 1 tick = 1 µs */
#define IR_GLITCH_NS 1250                 /* xung ngắn hơn = nhiễu (giới hạn bộ lọc phần cứng ~3 µs) */
#define IR_DEFAULT_IDLE_US 15000
#define IR_MAX_IDLE_US 30000              /* trần 15 bit tick của RMT = 32,7 ms */
#define IR_MAX_SYMBOLS_NO_DMA 192         /* 4 khối RX × 48 ký hiệu của ESP32-S3 */
#define IR_DEFAULT_SYMBOLS_DMA 1024

struct drv_ir_rx {
    rmt_channel_handle_t chan;
    rmt_symbol_word_t *sym;
    size_t max_symbols;
    QueueHandle_t done_q;
    rmt_receive_config_t rx_cfg;
};

static bool IRAM_ATTR on_recv_done(rmt_channel_handle_t chan, const rmt_rx_done_event_data_t *edata, void *ctx)
{
    struct drv_ir_rx *h = ctx;
    BaseType_t woken = pdFALSE;
    size_t n = edata->num_symbols;
    xQueueSendFromISR(h->done_q, &n, &woken);
    return woken == pdTRUE;
}

static esp_err_t arm(struct drv_ir_rx *h)
{
    return rmt_receive(h->chan, h->sym, h->max_symbols * sizeof(rmt_symbol_word_t), &h->rx_cfg);
}

esp_err_t drv_ir_rx_init(const drv_ir_rx_config_t *cfg, drv_ir_rx_handle_t *out)
{
    ESP_RETURN_ON_FALSE(cfg && out, ESP_ERR_INVALID_ARG, TAG, "null arg");
    size_t max_sym = cfg->max_symbols;
    if (max_sym == 0) {
        max_sym = cfg->use_dma ? IR_DEFAULT_SYMBOLS_DMA : IR_MAX_SYMBOLS_NO_DMA;
    }
    max_sym &= ~(size_t)1;   /* RMT yêu cầu số chẵn */
    ESP_RETURN_ON_FALSE(max_sym >= 48, ESP_ERR_INVALID_ARG, TAG, "max_symbols too small");
    ESP_RETURN_ON_FALSE(cfg->use_dma || max_sym <= IR_MAX_SYMBOLS_NO_DMA, ESP_ERR_INVALID_ARG, TAG,
                        "max_symbols > 192 needs use_dma");
    uint32_t idle_us = cfg->idle_timeout_us ? cfg->idle_timeout_us : IR_DEFAULT_IDLE_US;
    ESP_RETURN_ON_FALSE(idle_us <= IR_MAX_IDLE_US, ESP_ERR_INVALID_ARG, TAG, "idle_timeout_us > 30000");

    struct drv_ir_rx *h = calloc(1, sizeof(*h));
    ESP_RETURN_ON_FALSE(h, ESP_ERR_NO_MEM, TAG, "no mem");
    h->max_symbols = max_sym;
    h->rx_cfg.signal_range_min_ns = IR_GLITCH_NS;
    h->rx_cfg.signal_range_max_ns = idle_us * 1000;

    esp_err_t ret = ESP_OK;
    uint32_t caps = MALLOC_CAP_INTERNAL | MALLOC_CAP_8BIT | (cfg->use_dma ? MALLOC_CAP_DMA : 0);
    h->sym = heap_caps_calloc(max_sym, sizeof(rmt_symbol_word_t), caps);
    h->done_q = xQueueCreate(1, sizeof(size_t));
    ESP_GOTO_ON_FALSE(h->sym && h->done_q, ESP_ERR_NO_MEM, err, TAG, "no mem");

    rmt_rx_channel_config_t rx_cfg = {
        .gpio_num = cfg->gpio,
        .clk_src = RMT_CLK_SRC_DEFAULT,
        .resolution_hz = IR_RESOLUTION_HZ,
        .mem_block_symbols = max_sym,
        .flags.invert_in = cfg->active_low,   /* sau khi đảo: mức 1 = mark */
        .flags.with_dma = cfg->use_dma,
    };
    ESP_GOTO_ON_ERROR(rmt_new_rx_channel(&rx_cfg, &h->chan), err, TAG, "rmt_new_rx_channel failed");

    rmt_rx_event_callbacks_t cbs = {.on_recv_done = on_recv_done};
    ESP_GOTO_ON_ERROR(rmt_rx_register_event_callbacks(h->chan, &cbs, h), err, TAG, "register cb failed");
    ESP_GOTO_ON_ERROR(rmt_enable(h->chan), err, TAG, "rmt_enable failed");
    ESP_GOTO_ON_ERROR(arm(h), err, TAG, "rmt_receive failed");

    *out = h;
    ESP_LOGI(TAG, "IR RX ready on GPIO %d (%u symbols%s)", cfg->gpio, (unsigned)max_sym, cfg->use_dma ? ", DMA" : "");
    return ESP_OK;

err:
    if (h->chan) {
        rmt_disable(h->chan);
        rmt_del_channel(h->chan);
    }
    if (h->done_q) {
        vQueueDelete(h->done_q);
    }
    free(h->sym);
    free(h);
    return ret;
}

/* Ký hiệu RMT → chuỗi mark/space bắt đầu bằng mark; gộp 2 nửa liền nhau cùng mức. */
static esp_err_t to_durations(const rmt_symbol_word_t *sym, size_t n, uint16_t *out, size_t cap, size_t *count)
{
    size_t k = 0;
    bool overflow = false;
    for (size_t i = 0; i < n; i++) {
        for (int half = 0; half < 2; half++) {
            uint32_t level = half ? sym[i].level1 : sym[i].level0;
            uint32_t dur = half ? sym[i].duration1 : sym[i].duration0;
            if (dur == 0) {
                continue;   /* dấu kết thúc */
            }
            if (k == 0 && level == 0) {
                continue;   /* bỏ khoảng lặng đầu */
            }
            bool want_mark = (k % 2) == 0;
            if ((level == 1) == want_mark) {
                if (k < cap) {
                    out[k++] = (uint16_t)dur;
                } else {
                    overflow = true;
                }
            } else if (k > 0) {
                uint32_t merged = (uint32_t)out[k - 1] + dur;
                out[k - 1] = merged > UINT16_MAX ? UINT16_MAX : (uint16_t)merged;
            }
        }
    }
    *count = k;
    return overflow ? ESP_ERR_INVALID_SIZE : ESP_OK;
}

esp_err_t drv_ir_rx_receive(drv_ir_rx_handle_t h, uint16_t *durations_us, size_t cap, size_t *count,
                            uint32_t timeout_ms)
{
    ESP_RETURN_ON_FALSE(h && durations_us && count, ESP_ERR_INVALID_ARG, TAG, "null arg");
    *count = 0;
    size_t n = 0;
    if (xQueueReceive(h->done_q, &n, pdMS_TO_TICKS(timeout_ms)) != pdTRUE) {
        return ESP_ERR_TIMEOUT;
    }
    if (n > h->max_symbols) {
        n = h->max_symbols;
    }
    esp_err_t err = to_durations(h->sym, n, durations_us, cap, count);
    esp_err_t arm_err = arm(h);   /* nghe khung tiếp theo */
    if (arm_err != ESP_OK) {
        ESP_LOGE(TAG, "re-arm failed: %s", esp_err_to_name(arm_err));
        return arm_err;
    }
    return err;
}

esp_err_t drv_ir_rx_del(drv_ir_rx_handle_t h)
{
    if (h == NULL) {
        return ESP_ERR_INVALID_ARG;
    }
    rmt_disable(h->chan);
    rmt_del_channel(h->chan);
    vQueueDelete(h->done_q);
    free(h->sym);
    free(h);
    return ESP_OK;
}
