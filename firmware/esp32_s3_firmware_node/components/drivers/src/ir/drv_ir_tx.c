#include "drv_ir_tx.h"

#include <stdlib.h>

#include "driver/rmt_encoder.h"
#include "driver/rmt_tx.h"
#include "drv_ir_nec.h"
#include "esp_check.h"
#include "esp_heap_caps.h"
#include "freertos/FreeRTOS.h"
#include "freertos/semphr.h"

static const char *TAG = "drv_ir_tx";

#define IR_RESOLUTION_HZ 1000000   /* 1 tick = 1 µs */
#define IR_MAX_TICKS 32767
#define IR_DEFAULT_CARRIER 38000
#define IR_DEFAULT_DUTY 33

struct drv_ir_tx {
    rmt_channel_handle_t chan;
    rmt_encoder_handle_t enc;
    SemaphoreHandle_t lock;
    uint32_t default_carrier_hz;
    uint32_t carrier_hz;   /* sóng mang đang áp cho kênh */
    float duty;
};

static esp_err_t apply_carrier(struct drv_ir_tx *h, uint32_t hz)
{
    rmt_carrier_config_t cc = {
        .frequency_hz = hz,
        .duty_cycle = h->duty,
    };
    ESP_RETURN_ON_ERROR(rmt_apply_carrier(h->chan, &cc), TAG, "apply carrier failed");
    h->carrier_hz = hz;
    return ESP_OK;
}

esp_err_t drv_ir_tx_init(const drv_ir_tx_config_t *cfg, drv_ir_tx_handle_t *out)
{
    ESP_RETURN_ON_FALSE(cfg && out, ESP_ERR_INVALID_ARG, TAG, "null arg");
    struct drv_ir_tx *h = calloc(1, sizeof(*h));
    ESP_RETURN_ON_FALSE(h, ESP_ERR_NO_MEM, TAG, "no mem");
    h->default_carrier_hz = cfg->default_carrier_hz ? cfg->default_carrier_hz : IR_DEFAULT_CARRIER;
    h->duty = (float)(cfg->duty_pct ? cfg->duty_pct : IR_DEFAULT_DUTY) / 100.0f;

    esp_err_t ret = ESP_OK;
    h->lock = xSemaphoreCreateMutex();
    ESP_GOTO_ON_FALSE(h->lock, ESP_ERR_NO_MEM, err, TAG, "no mem");

    rmt_tx_channel_config_t tx_cfg = {
        .gpio_num = cfg->gpio,
        .clk_src = RMT_CLK_SRC_DEFAULT,
        .resolution_hz = IR_RESOLUTION_HZ,
        .mem_block_symbols = 64,   /* mã dài hơn được RMT nạp tiếp kiểu ping-pong */
        .trans_queue_depth = 4,
        .flags.invert_out = cfg->invert_out,
    };
    ESP_GOTO_ON_ERROR(rmt_new_tx_channel(&tx_cfg, &h->chan), err, TAG, "rmt_new_tx_channel failed");
    ESP_GOTO_ON_ERROR(apply_carrier(h, h->default_carrier_hz), err, TAG, "carrier");

    rmt_copy_encoder_config_t enc_cfg = {};
    ESP_GOTO_ON_ERROR(rmt_new_copy_encoder(&enc_cfg, &h->enc), err, TAG, "copy encoder failed");
    ESP_GOTO_ON_ERROR(rmt_enable(h->chan), err, TAG, "rmt_enable failed");

    *out = h;
    ESP_LOGI(TAG, "IR TX ready on GPIO %d (%u Hz carrier)", cfg->gpio, (unsigned)h->default_carrier_hz);
    return ESP_OK;

err:
    if (h->enc) {
        rmt_del_encoder(h->enc);
    }
    if (h->chan) {
        rmt_del_channel(h->chan);
    }
    if (h->lock) {
        vSemaphoreDelete(h->lock);
    }
    free(h);
    return ret;
}

static uint16_t clamp_ticks(uint16_t us, bool allow_zero)
{
    if (us > IR_MAX_TICKS) {
        return IR_MAX_TICKS;
    }
    if (us == 0 && !allow_zero) {
        return 1;   /* 0 giữa chuỗi = dấu kết thúc của RMT → phát cụt */
    }
    return us;
}

esp_err_t drv_ir_tx_send_raw(drv_ir_tx_handle_t h, const uint16_t *durations_us, size_t count, uint32_t carrier_hz,
                             uint32_t timeout_ms)
{
    ESP_RETURN_ON_FALSE(h && durations_us, ESP_ERR_INVALID_ARG, TAG, "null arg");
    ESP_RETURN_ON_FALSE(count > 0 && count <= DRV_IR_TX_MAX_DURATIONS, ESP_ERR_INVALID_SIZE, TAG, "bad length");

    size_t nsym = (count + 1) / 2;
    /* Encoder đọc bộ đệm trong ngắt → phải ở RAM trong (không phải PSRAM). */
    rmt_symbol_word_t *sym = heap_caps_malloc(nsym * sizeof(rmt_symbol_word_t), MALLOC_CAP_INTERNAL | MALLOC_CAP_8BIT);
    ESP_RETURN_ON_FALSE(sym, ESP_ERR_NO_MEM, TAG, "no mem");
    for (size_t i = 0; i < nsym; i++) {
        size_t m = 2 * i;
        bool last = (m + 1 >= count);
        sym[i].level0 = 1;
        sym[i].duration0 = clamp_ticks(durations_us[m], false);
        sym[i].level1 = 0;
        sym[i].duration1 = last ? 0 : clamp_ticks(durations_us[m + 1], false);
    }

    uint32_t hz = carrier_hz ? carrier_hz : h->default_carrier_hz;
    xSemaphoreTake(h->lock, portMAX_DELAY);
    esp_err_t err = ESP_OK;
    if (hz != h->carrier_hz) {
        /* Đổi sóng mang khi kênh rảnh (đã chờ xong lần phát trước trong cùng lock). */
        rmt_disable(h->chan);
        err = apply_carrier(h, hz);
        rmt_enable(h->chan);
    }
    if (err == ESP_OK) {
        rmt_transmit_config_t tc = {
            .loop_count = 0,
            .flags.eot_level = 0,   /* kết thúc: LED tắt */
        };
        err = rmt_transmit(h->chan, h->enc, sym, nsym * sizeof(rmt_symbol_word_t), &tc);
        if (err == ESP_OK) {
            err = rmt_tx_wait_all_done(h->chan, (int)timeout_ms);
        }
    }
    xSemaphoreGive(h->lock);
    free(sym);
    if (err != ESP_OK) {
        ESP_LOGW(TAG, "send failed: %s", esp_err_to_name(err));
    }
    return err;
}

esp_err_t drv_ir_tx_send_nec(drv_ir_tx_handle_t h, uint16_t address, uint8_t command, uint32_t timeout_ms)
{
    uint16_t d[DRV_IR_NEC_DURATIONS];
    size_t n = drv_ir_nec_encode(address, command, d, DRV_IR_NEC_DURATIONS);
    return drv_ir_tx_send_raw(h, d, n, DRV_IR_NEC_CARRIER_HZ, timeout_ms);
}

esp_err_t drv_ir_tx_del(drv_ir_tx_handle_t h)
{
    if (h == NULL) {
        return ESP_ERR_INVALID_ARG;
    }
    rmt_disable(h->chan);
    rmt_del_encoder(h->enc);
    rmt_del_channel(h->chan);
    vSemaphoreDelete(h->lock);
    free(h);
    return ESP_OK;
}
