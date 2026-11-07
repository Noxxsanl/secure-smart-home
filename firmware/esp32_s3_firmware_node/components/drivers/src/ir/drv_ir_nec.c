#include "drv_ir_nec.h"

#include <stdbool.h>

#define NEC_LEADER_MARK 9000
#define NEC_LEADER_SPACE 4500
#define NEC_REPEAT_SPACE 2250
#define NEC_BIT_MARK 560
#define NEC_ZERO_SPACE 560
#define NEC_ONE_SPACE 1690

static bool near(uint32_t value, uint32_t target)
{
    return value * 100 >= target * 70 && value * 100 <= target * 130;
}

size_t drv_ir_nec_encode(uint16_t address, uint8_t command, uint16_t *durations_us, size_t cap)
{
    if (durations_us == NULL || cap < DRV_IR_NEC_DURATIONS) {
        return 0;
    }
    uint32_t frame = (uint32_t)address | ((uint32_t)command << 16) | ((uint32_t)(uint8_t)~command << 24);
    size_t n = 0;
    durations_us[n++] = NEC_LEADER_MARK;
    durations_us[n++] = NEC_LEADER_SPACE;
    for (int i = 0; i < 32; i++) {
        durations_us[n++] = NEC_BIT_MARK;
        durations_us[n++] = ((frame >> i) & 1u) ? NEC_ONE_SPACE : NEC_ZERO_SPACE;
    }
    durations_us[n++] = NEC_BIT_MARK;
    return n;
}

size_t drv_ir_nec_encode_repeat(uint16_t *durations_us, size_t cap)
{
    if (durations_us == NULL || cap < DRV_IR_NEC_REPEAT_DURATIONS) {
        return 0;
    }
    durations_us[0] = NEC_LEADER_MARK;
    durations_us[1] = NEC_REPEAT_SPACE;
    durations_us[2] = NEC_BIT_MARK;
    return DRV_IR_NEC_REPEAT_DURATIONS;
}

drv_ir_nec_result_t drv_ir_nec_decode(const uint16_t *durations_us, size_t count, uint16_t *address,
                                      uint8_t *command)
{
    const uint16_t *d = durations_us;
    if (d == NULL || count < DRV_IR_NEC_REPEAT_DURATIONS || !near(d[0], NEC_LEADER_MARK)) {
        return DRV_IR_NEC_NONE;
    }
    if (near(d[1], NEC_REPEAT_SPACE) && near(d[2], NEC_BIT_MARK) && count <= 4) {
        return DRV_IR_NEC_REPEAT;
    }
    if (count < 2 + 64 || !near(d[1], NEC_LEADER_SPACE)) {
        return DRV_IR_NEC_NONE;
    }

    uint32_t frame = 0;
    for (int i = 0; i < 32; i++) {
        uint16_t mark = d[2 + 2 * i];
        uint16_t space = d[3 + 2 * i];
        if (!near(mark, NEC_BIT_MARK)) {
            return DRV_IR_NEC_NONE;
        }
        if (near(space, NEC_ONE_SPACE)) {
            frame |= 1u << i;
        } else if (!near(space, NEC_ZERO_SPACE)) {
            return DRV_IR_NEC_NONE;
        }
    }

    uint8_t cmd = (uint8_t)(frame >> 16);
    uint8_t inv = (uint8_t)(frame >> 24);
    if ((uint8_t)(cmd ^ inv) != 0xFF) {
        return DRV_IR_NEC_NONE;
    }
    if (address) {
        *address = (uint16_t)(frame & 0xFFFF);
    }
    if (command) {
        *command = cmd;
    }
    return DRV_IR_NEC_FRAME;
}
