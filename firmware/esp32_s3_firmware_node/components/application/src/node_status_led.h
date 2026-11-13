/*
 * node_status_led — LED RGB WS2812 báo trạng thái Node (riêng của application). Một task nhỏ vẽ màu 50 ms/lần.
 *
 * Ưu tiên từ cao xuống thấp:
 *   trắng chớp ngắn    nhận lệnh từ Gateway / gửi telemetry thành công (node_status_led_flash)
 *   đỏ nháy nhanh      lỗi: mất cảm biến SHT31, relay / động cơ rèm không khởi tạo được (node_status_led_set_error)
 *   tím liền           rèm đang chạy (node_status_led_set_busy)
 *   theo kết nối       xanh dương liền = đang khởi động; đỏ nháy chậm = chưa ghép nối Gateway (NVS thiếu);
 *                      vàng nháy = đang dò kênh / chưa có giờ; xanh lá liền = đã nối Gateway
 *
 * Độ sáng: menuconfig "Node S3: LED debug". Tắt LED trong menuconfig thì mọi hàm không làm gì.
 */
#pragma once

#include <stdbool.h>

#include "esp_err.h"

#ifdef __cplusplus
extern "C" {
#endif

typedef enum {
    NODE_LED_BOOT = 0,     /* xanh dương liền */
    NODE_LED_UNPAIRED,     /* đỏ nháy chậm */
    NODE_LED_SEARCHING,    /* vàng nháy */
    NODE_LED_ONLINE,       /* xanh lá liền */
} node_led_link_t;

/** Gọi sớm nhất có thể (trước màn hình) để thấy "đang khởi động". ESP_ERR_NOT_SUPPORTED nếu LED tắt. */
esp_err_t node_status_led_start(void);

/* Gọi được từ task bất kỳ. */
void node_status_led_set_link(node_led_link_t link);
void node_status_led_set_busy(bool busy);
void node_status_led_set_error(bool error);
void node_status_led_flash(void);

#ifdef __cplusplus
}
#endif
