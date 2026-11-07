/*
 * Mã hoá / giải mã giao thức IR NEC trên chuỗi thời lượng mark/space (µs, phần tử chẵn = mark).
 * Cùng định dạng với drv_ir_tx_send_raw() và drv_ir_rx_receive(), nên mã học được (raw) và mã NEC
 * đi chung một đường phát.
 *
 * Khung NEC: mark 9000 + space 4500, 32 bit LSB trước (địa chỉ 16 bit, lệnh 8 bit, ~lệnh 8 bit), mark kết.
 * NEC chuẩn địa chỉ 8 bit: truyền address = a | (~a << 8).
 */
#pragma once

#include <stddef.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

#define DRV_IR_NEC_DURATIONS 67          /* 2 (leader) + 32 × 2 + 1 (mark kết) */
#define DRV_IR_NEC_REPEAT_DURATIONS 3
#define DRV_IR_NEC_CARRIER_HZ 38000

typedef enum {
    DRV_IR_NEC_NONE = 0,   /* không phải NEC (có thể là mã điều hoà — lưu dạng raw) */
    DRV_IR_NEC_FRAME,      /* khung đầy đủ, address/command hợp lệ */
    DRV_IR_NEC_REPEAT,     /* mã lặp khi giữ phím */
} drv_ir_nec_result_t;

/** Trả số phần tử đã ghi (DRV_IR_NEC_DURATIONS), 0 nếu `cap` không đủ. */
size_t drv_ir_nec_encode(uint16_t address, uint8_t command, uint16_t *durations_us, size_t cap);

size_t drv_ir_nec_encode_repeat(uint16_t *durations_us, size_t cap);

/** Sai số cho phép ±30% (mắt thu VS1838B thường kéo dài mark, rút ngắn space). */
drv_ir_nec_result_t drv_ir_nec_decode(const uint16_t *durations_us, size_t count, uint16_t *address,
                                      uint8_t *command);

#ifdef __cplusplus
}
#endif
