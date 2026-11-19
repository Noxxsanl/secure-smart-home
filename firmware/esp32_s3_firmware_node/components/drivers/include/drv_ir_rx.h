/*
 * Thu hồng ngoại qua mắt thu VS1838B (đã giải điều chế 38 kHz, ngõ ra mức THẤP khi có sóng) bằng RMT RX.
 *
 * Cấp nguồn VS1838B bằng 3,3 V (nguồn 5 V làm ngõ ra lên 5 V, quá áp chân ESP32-S3), thêm RC 100 Ω + 4,7 µF
 * ở chân nguồn như datasheet để đỡ nhiễu.
 *
 * Trả chuỗi mark/space µs bắt đầu bằng mark (cùng định dạng drv_ir_tx_send_raw) — dùng để giải mã NEC
 * (drv_ir_nec_decode) hoặc "học" mã điều hoà rồi phát lại nguyên dạng.
 *
 * Lưu ý: LED phát của chính node có thể lọt vào mắt thu → tầng trên bỏ qua khung nhận ngay sau khi phát.
 */
#pragma once

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

#include "esp_err.h"

#ifdef __cplusplus
extern "C" {
#endif

typedef struct {
    int gpio;
    bool active_low;           /* VS1838B: true */
    bool use_dma;              /* true để học mã điều hoà dài (> 190 ký hiệu) */
    size_t max_symbols;        /* 0 = 192 (không DMA, tối đa 192) hoặc 1024 (DMA). 1 ký hiệu = 1 cặp mark/space */
    uint32_t idle_timeout_us;  /* im lặng lâu hơn mức này = hết khung. 0 = 15000, tối đa 30000 */
} drv_ir_rx_config_t;

typedef struct drv_ir_rx *drv_ir_rx_handle_t;

/** Khởi tạo và bắt đầu nghe luôn. */
esp_err_t drv_ir_rx_init(const drv_ir_rx_config_t *cfg, drv_ir_rx_handle_t *out);

/**
 * Chờ 1 khung. ESP_ERR_TIMEOUT nếu không có; ESP_ERR_INVALID_SIZE nếu khung dài hơn `cap`
 * (vẫn trả phần đầu trong `durations_us`, `count` = số phần tử đã ghi). Chỉ gọi từ 1 task.
 */
esp_err_t drv_ir_rx_receive(drv_ir_rx_handle_t h, uint16_t *durations_us, size_t cap, size_t *count,
                            uint32_t timeout_ms);

esp_err_t drv_ir_rx_del(drv_ir_rx_handle_t h);

#ifdef __cplusplus
}
#endif
