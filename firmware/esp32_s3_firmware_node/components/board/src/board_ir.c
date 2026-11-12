#include "board_ir.h"

#include "drv_ir_rx.h"
#include "drv_ir_tx.h"
#include "esp_check.h"
#include "esp_log.h"
#include "sdkconfig.h"

static const char *TAG = "board_ir";

#define IR_TX_TIMEOUT_MS 1000   /* mã điều hòa dài nhất ~0,5 s */

static drv_ir_rx_handle_t s_rx;
static drv_ir_tx_handle_t s_tx;

esp_err_t board_ir_init(void)
{
#if CONFIG_NODE_IR_ENABLE
    if (s_rx != NULL && s_tx != NULL) {
        return ESP_OK;
    }
    if (s_tx == NULL) {
        const drv_ir_tx_config_t tx = {
            .gpio = CONFIG_NODE_IR_TX_GPIO,
#if CONFIG_NODE_IR_TX_INVERT
            .invert_out = true,
#endif
        };
        ESP_RETURN_ON_ERROR(drv_ir_tx_init(&tx, &s_tx), TAG, "IR TX on GPIO %d", CONFIG_NODE_IR_TX_GPIO);
    }
    if (s_rx == NULL) {
        /* DMA + 1024 ký hiệu: đủ mã điều hòa 2–3 khung (~600 thời lượng). Khung cách nhau < 30 ms được gộp sẵn. */
        const drv_ir_rx_config_t rx = {
            .gpio = CONFIG_NODE_IR_RX_GPIO,
            .active_low = true,
            .use_dma = true,
            .idle_timeout_us = BOARD_IR_FRAME_IDLE_US,
        };
        ESP_RETURN_ON_ERROR(drv_ir_rx_init(&rx, &s_rx), TAG, "IR RX on GPIO %d", CONFIG_NODE_IR_RX_GPIO);
    }
    return ESP_OK;
#else
    return ESP_ERR_NOT_SUPPORTED;
#endif
}

bool board_ir_ready(void)
{
    return s_rx != NULL && s_tx != NULL;
}

esp_err_t board_ir_send(const uint16_t *durations_us, size_t count, uint32_t carrier_hz)
{
    ESP_RETURN_ON_FALSE(s_tx != NULL, ESP_ERR_INVALID_STATE, TAG, "IR not initialised");
    return drv_ir_tx_send_raw(s_tx, durations_us, count, carrier_hz, IR_TX_TIMEOUT_MS);
}

esp_err_t board_ir_receive(uint16_t *durations_us, size_t cap, size_t *count, uint32_t timeout_ms)
{
    ESP_RETURN_ON_FALSE(s_rx != NULL, ESP_ERR_INVALID_STATE, TAG, "IR not initialised");
    return drv_ir_rx_receive(s_rx, durations_us, cap, count, timeout_ms);
}
