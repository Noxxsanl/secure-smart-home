/*
 * sm_counter — bộ đếm chống phát lại `ctr` dùng chung cho Node, Gateway, Camera (API_DESIGN §3, §11).
 *
 * Giá trị tăng NGẶT qua mọi lần gọi, kể cả qua khởi động lại / mất điện: ctr = max(ctr trước + 1, giờ unix * 1000).
 * Bám theo giờ (ms) nên backend nhận ngay sau khi nạp lại NVS hay đăng ký lại; mức sàn lưu NVS (namespace "sec",
 * khoá "ctr_floor") được đặt trước 10 phút, nên chỉ ghi flash khoảng 6 lần/giờ và đồng hồ có lùi cũng không làm ctr lùi.
 * Bên nhận lưu ctr lớn nhất đã thấy theo bên gửi và từ chối gói có ctr ≤ giá trị đó → gửi lại nguyên gói vô hiệu.
 * Mỗi thiết bị chỉ có MỘT bộ đếm (một khoá NVS), dùng chung cho mọi chuỗi ký của thiết bị đó.
 *
 * Cần nvs_flash_init() đã chạy trước khi gọi.
 */
#pragma once

#include <stdint.h>

#include "esp_err.h"

#ifdef __cplusplus
extern "C" {
#endif

/** ctr tiếp theo; `now_unix` = giờ đã đồng bộ (giây, > 0). An toàn khi gọi từ nhiều task. */
esp_err_t sm_counter_next(int64_t now_unix, int64_t *out);

#ifdef __cplusplus
}
#endif
