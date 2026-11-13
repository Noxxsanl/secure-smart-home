/*
 * gw_live_view — đường ống giải nén khung camera cho LCD (header riêng của tầng ui, chỉ gw_ui.c dùng).
 *
 * Task "gw_decode" (nhân 1, ưu tiên 1 — thấp hơn task LVGL nên giải nén không làm giật giao diện) chỉ lấy khung MỚI NHẤT:
 *   - gw_live_view_submit ghi đè ô chờ duy nhất; khung cũ chưa kịp giải nén bị bỏ (trả lại cho người gửi qua release),
 *     không xếp hàng, không chép dữ liệu JPEG (chỉ đổi con trỏ).
 *   - giải nén vào 1 trong 2 bộ đệm RGB565 (PSRAM) mà LVGL không vẽ, rồi đổi nguồn ảnh dưới khoá LVGL: LVGL chỉ đọc ảnh
 *     trong lv_timer_handler (giữ khoá) nên bộ đệm cũ không còn được đọc sau khi đổi.
 * Nhờ vậy thông lượng = max(nhận, giải nén), không phải tổng. Log mỗi 5 s: khung hiển thị/giây, ms giải nén trung bình,
 * khung bị bỏ.
 */
#pragma once

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

#include "esp_err.h"
#include "lvgl.h"

typedef void (*gw_live_release_t)(void *arg);

typedef struct {
    bool (*is_on)(void);                       /* LCD đang xem luồng? (không thì bỏ khung, không giải nén) */
    void (*present)(const lv_img_dsc_t *dsc);  /* ĐANG giữ khoá LVGL: đổi nguồn ảnh */
    void (*shown)(uint16_t fps_x10, bool fps_updated);   /* đã hiển thị 1 khung (không giữ khoá LVGL) */
} gw_live_view_ops_t;

/** Cần gw_display_init trước. Tạo 2 bộ đệm max_w × max_h (PSRAM) + task. */
esp_err_t gw_live_view_start(uint16_t max_w, uint16_t max_h, const gw_live_view_ops_t *ops);

/**
 * Giao 1 khung JPEG (bộ đệm của người gửi, phải còn nguyên cho tới khi release được gọi). Thành công → gw_live_view giữ
 * khung và gọi release(arg) khi xong (đã giải nén, bị thay bằng khung mới hơn, hoặc bị flush). Lỗi → người gửi vẫn giữ khung.
 * ESP_ERR_INVALID_STATE khi LCD không xem luồng.
 */
esp_err_t gw_live_view_submit(const uint8_t *jpeg, size_t len, gw_live_release_t release, void *arg);

/** Bỏ khung đang chờ (VD rời trang Camera) và trả lại cho người gửi. */
void gw_live_view_flush(void);
