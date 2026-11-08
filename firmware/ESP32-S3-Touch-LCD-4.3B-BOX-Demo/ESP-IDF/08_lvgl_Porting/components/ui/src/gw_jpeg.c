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
    unsigned dw, dh;   /* kích thước ảnh ra = số điểm mỗi dòng của dst */
    uint32_t fx, fy;   /* bước 16.16: số điểm đích trên 1 điểm nguồn (sau khi TJpgDec thu nhỏ) */
} io_t;

/* Toạ độ nguồn v → toạ độ đích (16.16), chặn ở lim. v·f ≤ dw·65536 + sw < 2^32 với dw ≤ 800. */
static inline unsigned map_coord(unsigned v, uint32_t f, unsigned lim)
{
    unsigned r = (unsigned)((v * f) >> 16);
    return r > lim ? lim : r;
}

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

/*
 * 1 khối MCU đã giải nén (RGB888, toạ độ sau thu nhỏ) → RGB565 của LVGL (R 5 bit cao, G 6 bit giữa, B 5 bit thấp).
 * Mỗi điểm nguồn phủ ô đích [map(x), map(x+1)) × [map(y), map(y+1)): co nhỏ thì có điểm bị bỏ, phóng to thì lặp.
 */
static UINT out_cb(JDEC *jd, void *bitmap, JRECT *r)
{
    io_t *io = (io_t *)jd->device;
    const uint8_t *p = (const uint8_t *)bitmap;
    const unsigned cols = (unsigned)r->right - r->left + 1;

    for (unsigned y = r->top; y <= r->bottom; y++) {
        const unsigned y0 = map_coord(y, io->fy, io->dh);
        const unsigned y1 = map_coord(y + 1, io->fy, io->dh);
        if (y0 >= y1) {
            p += cols * 3;   /* dòng nguồn bị bỏ khi co nhỏ */
            continue;
        }
        for (unsigned x = r->left; x <= r->right; x++, p += 3) {
            const unsigned x0 = map_coord(x, io->fx, io->dw);
            const unsigned x1 = map_coord(x + 1, io->fx, io->dw);
            if (x0 >= x1) {
                continue;
            }
            const uint16_t c = (uint16_t)(((p[0] & 0xF8) << 8) | ((p[1] & 0xFC) << 3) | (p[2] >> 3));
            for (unsigned yy = y0; yy < y1; yy++) {
                uint16_t *row = io->dst + (size_t)yy * io->dw;
                for (unsigned xx = x0; xx < x1; xx++) {
                    row[xx] = c;
                }
            }
        }
    }
    return 1;   /* tiếp tục */
}

esp_err_t gw_jpeg_decode_fit(gw_jpeg_decoder_t *dec, const uint8_t *jpeg, size_t len, uint16_t *dst, uint16_t max_w,
                             uint16_t max_h, uint16_t *out_w, uint16_t *out_h)
{
    if (dec == NULL || jpeg == NULL || len < 4 || dst == NULL || max_w == 0 || max_h == 0 || out_w == NULL ||
        out_h == NULL) {
        return ESP_ERR_INVALID_ARG;
    }
    io_t io = {.src = jpeg, .len = len, .dst = dst};
    JDEC jd;
    JRESULT res = jd_prepare(&jd, in_cb, dec->work, sizeof(dec->work), &io);
    if (res != JDR_OK) {
        ESP_LOGD(TAG, "jd_prepare: %d", (int)res);
        return (res == JDR_FMT2 || res == JDR_FMT3) ? ESP_ERR_NOT_SUPPORTED : ESP_FAIL;
    }
    const unsigned w = jd.width, h = jd.height;
    if (w == 0 || h == 0) {
        return ESP_FAIL;
    }

    /* Kích thước ra: vừa khung, giữ tỉ lệ. */
    unsigned dw, dh;
    if ((uint32_t)w * max_h >= (uint32_t)h * max_w) {
        dw = max_w;
        dh = (unsigned)((uint32_t)h * max_w / w);
    } else {
        dh = max_h;
        dw = (unsigned)((uint32_t)w * max_h / h);
    }
    dw = dw ? dw : 1;
    dh = dh ? dh : 1;

    /* TJpgDec thu nhỏ thô tới mức vẫn ≥ kích thước ra (không mất nét), phần còn lại co/giãn điểm gần nhất. */
    int scale = 0;
    while (scale < 3 && (w >> (scale + 1)) >= dw && (h >> (scale + 1)) >= dh) {
        scale++;
    }
    const unsigned sw = w >> scale, sh = h >> scale;
    io.dw = dw;
    io.dh = dh;
    io.fx = (uint32_t)((((uint32_t)dw << 16) + sw - 1) / sw);   /* làm tròn lên: cột/dòng cuối luôn được phủ */
    io.fy = (uint32_t)((((uint32_t)dh << 16) + sh - 1) / sh);

    res = jd_decomp(&jd, out_cb, (BYTE)scale);
    if (res != JDR_OK) {
        ESP_LOGD(TAG, "jd_decomp: %d", (int)res);
        return ESP_FAIL;
    }
    *out_w = (uint16_t)dw;
    *out_h = (uint16_t)dh;
    return ESP_OK;
}
