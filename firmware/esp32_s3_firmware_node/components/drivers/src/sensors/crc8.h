/* CRC-8 đa thức 0x31, khởi tạo 0xFF — dùng chung cho SHT3x (Sensirion) và AHT20. Header nội bộ. */
#pragma once

#include <stddef.h>
#include <stdint.h>

static inline uint8_t drv_crc8_31(const uint8_t *data, size_t len)
{
    uint8_t crc = 0xFF;
    for (size_t i = 0; i < len; i++) {
        crc ^= data[i];
        for (int b = 0; b < 8; b++) {
            crc = (crc & 0x80) ? (uint8_t)((crc << 1) ^ 0x31) : (uint8_t)(crc << 1);
        }
    }
    return crc;
}
