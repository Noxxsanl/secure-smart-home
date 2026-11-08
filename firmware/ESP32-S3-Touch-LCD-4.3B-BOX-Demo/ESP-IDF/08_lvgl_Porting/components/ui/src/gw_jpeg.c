#include "gw_jpeg.h"

#include <string.h>

#include "esp_log.h"
#include "rom/tjpgd.h"   /* esp_rom: TJpgDec R0.01 trong ROM, xuất RGB888 (JD_FORMAT 0), có thu nhỏ */

static const char *TAG = "gw_jpeg";

typedef struct {
    const uint8_t *src;
    size_t len;
    size_t pos;
    uint16_t *dst;
    unsigned stride;   /* điểm ảnh mỗi dòng của dst = out_w */
    unsigned out_w, out_h;
    unsigned up;       /* 1 hoặc 2 */
} io_t;

/* Đọc dữ liệu nén; buf = NULL nghĩa là bỏ qua n byte. */
static UINT in_cb(JDEC *jd, BYTE *buf, UINT n)
{
    io_t *io = (io_t *)jd->device;
    size_t left = io->len - io->pos;
    if (n > left) {
        n = (UINT)left;
    }
    if (buf != NULL) {
        memcpy(buf, io->src + io->pos, n);
    }
    io->pos += n;
    return n;
}

/* 1 khối MCU đã giải nén (RGB888, toạ độ sau thu nhỏ) → RGB565 của LVGL: R 5 bit cao, G 6 bit giữa, B 5 bit thấp. */
static UINT out_cb(JDEC *jd, void *bitmap, JRECT *r)
{
    io_t *io = (io_t *)jd->device;
    const uint8_t *p = (const uint8_t *)bitmap;
    const unsigned up = io->up;
    const unsigned cols = (unsigned)r->right - r->left + 1;

    for (unsigned y = r->top; y <= r->bottom; y++) {
        if (y * up >= io->out_h) {
            p += cols * 3;
            continue;
        }
        uint16_t *row = io->dst + (size_t)y * up * io->stride;
        for (unsigned x = r->left; x <= r->right; x++, p += 3) {
            if (x * up >= io->out_w) {
                continue;
            }
            const uint16_t c = (uint16_t)(((p[0] & 0xF8) << 8) | ((p[1] & 0xFC) << 3) | (p[2] >> 3));
            if (up == 1) {
                row[x] = c;
            } else {
                uint16_t *q = row + 2 * x;
                q[0] = c;
                q[1] = c;
                q[io->stride] = c;
                q[io->stride + 1] = c;
            }
        }
    }
    return 1;   /* tiếp tục */
}

esp_err_t gw_jpeg_decode_rgb565(gw_jpeg_decoder_t *dec, const uint8_t *jpeg, size_t len, uint16_t *dst,
                                uint16_t max_w, uint16_t max_h, bool allow_2x, uint16_t *out_w, uint16_t *out_h)
{
    if (dec == NULL || jpeg == NULL || len < 4 || dst == NULL || max_w == 0 || max_h == 0 || out_w == NULL ||
        out_h == NULL) {
        return ESP_ERR_INVALID_ARG;
    }
    io_t io = {.src = jpeg, .len = len};
    JDEC jd;
    JRESULT res = jd_prepare(&jd, in_cb, dec->work, sizeof(dec->work), &io);
    if (res != JDR_OK) {
        ESP_LOGD(TAG, "jd_prepare: %d", (int)res);
        return (res == JDR_FMT2 || res == JDR_FMT3) ? ESP_ERR_NOT_SUPPORTED : ESP_FAIL;
    }

    unsigned up = 1;
    int scale = -1;
    if (allow_2x && jd.width * 2 <= max_w && jd.height * 2 <= max_h) {
        up = 2;
        scale = 0;
    } else {
        for (int s = 0; s <= 3; s++) {
            if ((jd.width >> s) <= max_w && (jd.height >> s) <= max_h) {
                scale = s;
                break;
            }
        }
    }
    if (scale < 0) {
        ESP_LOGD(TAG, "%ux%u does not fit %ux%u", jd.width, jd.height, max_w, max_h);
        return ESP_ERR_INVALID_SIZE;
    }

    io.dst = dst;
    io.up = up;
    io.out_w = (jd.width >> scale) * up;
    io.out_h = (jd.height >> scale) * up;
    io.stride = io.out_w;
    res = jd_decomp(&jd, out_cb, (BYTE)scale);
    if (res != JDR_OK) {
        ESP_LOGD(TAG, "jd_decomp: %d", (int)res);
        return ESP_FAIL;
    }
    *out_w = (uint16_t)io.out_w;
    *out_h = (uint16_t)io.out_h;
    return ESP_OK;
}
