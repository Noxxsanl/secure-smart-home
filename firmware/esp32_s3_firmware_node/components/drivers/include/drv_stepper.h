/*
 * Động cơ bước 4 pha đơn cực (28BYJ-48) qua mạch ULN2003 — chạy NỬA BƯỚC (8 pha), không chặn task gọi.
 *
 * Nối: IN1..IN4 của ULN2003 → 4 GPIO, cấp nguồn động cơ (5 V cho bản 5 V) vào chân + của module, chung GND với ESP32.
 * 28BYJ-48: 4096 nửa bước ≈ 1 vòng trục ra (hộp số ~1:64).
 *
 * Bước được đếm bằng esp_timer (chu kỳ = step_period_us) chạy ở task esp_timer. Vị trí là số nguyên có dấu (bước),
 * chiều dương = quay theo thứ tự pha IN1 → IN2 → IN3 → IN4 (đảo bằng invert_dir). Driver KHÔNG có giới hạn hành trình
 * — tầng trên tự chặn (không có công tắc hành trình thì vị trí chỉ là số đếm, mất bước khi quá tải sẽ lệch).
 *
 * Dừng (tới đích hoặc drv_stepper_stop) thì NGẮT DÒNG cả 4 cuộn: 28BYJ-48 5 V giữ dòng ~240 mA sẽ nóng cả động cơ
 * lẫn ULN2003; hộp số giữ trục đủ chắc khi không cấp điện. 32 bước đầu mỗi lần chạy — và sau khi đổi chiều lúc đang
 * chạy — đi chậm gấp đôi (khởi động mềm).
 */
#pragma once

#include <stdbool.h>
#include <stdint.h>

#include "esp_err.h"

#ifdef __cplusplus
extern "C" {
#endif

typedef struct {
    int gpio[4];               /* IN1, IN2, IN3, IN4 */
    uint32_t step_period_us;   /* thời gian 1 nửa bước; 0 = 1500. 28BYJ-48 5 V: ≥ 1000 µs, có tải nên 1500–2500 */
    bool invert_dir;           /* đảo chiều quay (không phải đổi dây) */
} drv_stepper_config_t;

typedef struct drv_stepper *drv_stepper_handle_t;

/**
 * Báo khi động cơ dừng (tới đích hoặc bị drv_stepper_stop). reached = true nếu tới đúng đích.
 * Chạy trong task esp_timer: chỉ được đẩy việc sang task khác (xQueueSend không chờ), không chặn, không log nhiều.
 */
typedef void (*drv_stepper_done_cb_t)(int32_t position, bool reached, void *ctx);

/** 4 chân về mức thấp (cuộn không cấp điện) rồi mới bật output. Vị trí ban đầu = 0. */
esp_err_t drv_stepper_init(const drv_stepper_config_t *cfg, drv_stepper_handle_t *out);

void drv_stepper_set_done_cb(drv_stepper_handle_t h, drv_stepper_done_cb_t cb, void *ctx);

/** Chạy tới `target` (bước). Đang chạy thì đổi đích ngay (kể cả đảo chiều). Đã ở đích: không làm gì. */
esp_err_t drv_stepper_move_to(drv_stepper_handle_t h, int32_t target);

/** Dừng ở bước kế tiếp (≤ 1 chu kỳ bước), ngắt dòng, gọi callback với reached = false. Không chạy: không làm gì. */
esp_err_t drv_stepper_stop(drv_stepper_handle_t h);

/** Đặt lại số đếm (hiệu chuẩn). ESP_ERR_INVALID_STATE nếu đang chạy. */
esp_err_t drv_stepper_set_position(drv_stepper_handle_t h, int32_t position);

int32_t drv_stepper_position(drv_stepper_handle_t h);

int32_t drv_stepper_target(drv_stepper_handle_t h);

bool drv_stepper_is_moving(drv_stepper_handle_t h);

/** Dừng ngay (không gọi callback), ngắt dòng rồi giải phóng. */
esp_err_t drv_stepper_del(drv_stepper_handle_t h);

#ifdef __cplusplus
}
#endif
