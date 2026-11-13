/*
 * node_curtain — rèm cửa bằng động cơ bước 28BYJ-48 5 V qua ULN2003 (riêng của application).
 *
 * Không có công tắc hành trình: vị trí = số nửa bước đếm được (0 = ĐÓNG hẳn, hành trình = MỞ hẳn), lưu NVS (đang chạy
 * ~2 s/lần, dừng thì lưu ngay) nên mất điện vẫn nhớ. Hành trình hiệu chuẩn trên màn hình (bảng Rèm cửa → Hiệu chuẩn:
 * nhích tới mép, "Đặt là ĐÓNG hẳn" / "Đặt là MỞ hẳn"); chưa hiệu chuẩn thì dùng giá trị mặc định trong menuconfig.
 * Có điện lại: rèm KHÔNG tự chạy, chỉ nạp lại vị trí.
 *
 * Lệnh Gateway (params.target = "curtain"): turn_on = mở hẳn, turn_off = đóng hẳn, toggle, stop, set_pos_<0..100>.
 * Rèm chạy lâu hơn 3 s (Gateway chờ ack tối đa 3 s) nên ack NGAY khi bắt đầu chạy: ok + power = đích > 0 (mở); vị trí
 * thật gửi bằng telemetry khi dừng. Đang hiệu chuẩn (giữ nút nhích) thì từ chối lệnh từ xa.
 */
#pragma once

#include <stdbool.h>

#include "esp_err.h"

#ifdef __cplusplus
extern "C" {
#endif

/** Gọi sau node_ui_start (và nvs_flash_init nếu có). ESP_ERR_NOT_SUPPORTED nếu rèm tắt trong menuconfig. */
esp_err_t node_curtain_start(void);

/**
 * Lệnh từ Gateway (gọi trong task node_link). true = đã nhận, node_curtain tự gửi CMD_ACK.
 * false = không nhận (chưa chạy, hàng đợi đầy) — người gọi gửi ack lỗi.
 */
bool node_curtain_post_command(const char *command_id, const char *action);

/** % mở 0..100 (theo hành trình). false nếu rèm chưa chạy. */
bool node_curtain_get_percent(int *percent);

/**
 * % để gửi telemetry `curtain`: mức ĐÍCH khi đang chạy (đặt ngay lúc nhận lệnh), vị trí thật khi đứng yên. Báo đích
 * thay vì vị trí giữa chừng: Gateway/web đổi trạng thái ngay mà không nhảy mở/đóng qua lại. false nếu rèm chưa chạy.
 */
bool node_curtain_get_report_percent(int *percent);

bool node_curtain_is_moving(void);

/** true (và xoá cờ) nếu rèm vừa dừng ở vị trí mới / hiệu chuẩn lại — gửi telemetry ngay. */
bool node_curtain_take_changed(void);

#ifdef __cplusplus
}
#endif
