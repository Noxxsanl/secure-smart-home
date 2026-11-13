/*
 * Bản cài đặt gw_jpeg bằng esp_new_jpeg (espressif/esp_new_jpeg 1.0.2, thư viện dựng sẵn cho ESP32-S3).
 *
 * Kế hoạch cho mỗi khung (đọc kích thước từ header JPEG trước):
 *   NATIVE    ảnh vừa đúng ô (VD QVGA khi ô là 320x240) → giải nén thẳng vào dst
 *   SCALE     ảnh lớn hơn ô, cạnh ra làm tròn xuống bội của 8 và ≥ 1/8 cạnh gốc (VD VGA 640x480 → 448x336) →
 *             bộ giải nén tự thu nhỏ, ghi thẳng vào dst: không bước co giãn riêng, không bộ đệm phụ
 *   FALLBACK  còn lại (ảnh nhỏ hơn ô cần phóng lên, cỡ lạ, hoặc SCALE từng thất bại) → giải nén nguyên kích thước vào bộ
 *             đệm phụ trong PSRAM (cấp lần đầu cần, giữ lại) rồi co/giãn điểm gần nhất vào dst
 * SCALE lỗi (giải nén lỗi hoặc outlen ≠ dw*dh*2) ở 1 khung → khung đó chạy lại bằng FALLBACK. Chỉ khi ≥ SCALE_FAIL_MAX
 * khung liên tiếp như vậy (mỗi khung đường đầy đủ đều thành công) mới tắt SCALE cho các khung sau (log 1 lần); 1 lần
 * SCALE thành công đặt lại bộ đếm. Thư viện từ chối cấu hình thu nhỏ ngay lúc mở/đọc header cũng tính là lỗi SCALE.
 *
 * Đường lui cuối cùng: khung esp_new_jpeg không giải được (mọi chế độ) thì giải bằng TJpgDec trong ROM (gw_jpeg_tjpgd.h).
 * Nếu esp_new_jpeg chưa từng giải được khung nào sau ESP_GIVE_UP_FRAMES lần thử thì chuyển hẳn sang ROM (log 1 lần) — màn
 * hình luôn có hình, chậm hơn. 3 lỗi đầu được log kèm cấu trúc JPEG (SOF, lấy mẫu màu, DRI…) để chẩn đoán.
 */
#include "gw_jpeg.h"

#include <inttypes.h>
#include <stdbool.h>
#include <stdlib.h>
#include <string.h>

#include "esp_heap_caps.h"
#include "esp_jpeg_common.h"
#include "esp_jpeg_dec.h"
#include "esp_log.h"
#include "gw_jpeg_tjpgd.h"

static const char *TAG = "gw_jpeg";

#define ALIGN 16
#define MAX_DST_W 1024                 /* bảng ánh xạ cột của FALLBACK */
#define SCRATCH_MAX (1024 * 1024)      /* ảnh nguồn lớn hơn (≈ 640x800 điểm RGB565) thì từ chối */
#define SCALE_FAIL_MAX 3               /* số khung liên tiếp SCALE lỗi (đường đầy đủ thành công) thì tắt SCALE */
#define ESP_GIVE_UP_FRAMES 10          /* esp_new_jpeg chưa từng thành công sau ngần này khung → chỉ dùng ROM */
#define ESP_FAIL_LOG_FIRST 3           /* số lỗi đầu được log đầy đủ; sau đó log mỗi ESP_FAIL_LOG_EVERY lỗi */
#define ESP_FAIL_LOG_EVERY 500

struct gw_jpeg_decoder {
    uint16_t last_w, last_h;           /* kích thước khung trước — đoán cấu hình thu nhỏ khi mở bộ giải nén */
    bool scale_ok;                     /* SCALE của thư viện còn dùng được */
    uint8_t scale_fails;               /* số khung liên tiếp SCALE lỗi mà đường đầy đủ của khung đó thành công */
    uint8_t *scratch;                  /* FALLBACK: ảnh nguyên kích thước */
    size_t scratch_cap;
    const char *err_stage;             /* lỗi gần nhất của decode_fit: bước nào, mã của thư viện */
    int err_code;
    bool esp_ever_ok;                  /* esp_new_jpeg đã giải được ít nhất 1 khung */
    bool esp_off;                      /* đã chuyển hẳn sang TJpgDec ROM */
    uint16_t esp_fail_streak;          /* số khung lỗi liên tiếp khi esp_new_jpeg chưa từng thành công */
    uint32_t esp_fail_total;
    gw_jpeg_tjpgd_t *rom;              /* đường lui TJpgDec ROM, tạo khi cần lần đầu */
    uint16_t xmap[MAX_DST_W];          /* FALLBACK: cột đích → cột nguồn */
};

typedef enum {
    MODE_NATIVE,
    MODE_SCALE,
    MODE_FALLBACK,
} decode_mode_t;

typedef struct {
    decode_mode_t mode;
    unsigned dw, dh;                   /* kích thước ảnh ra */
} plan_t;

gw_jpeg_decoder_t *gw_jpeg_create(void)
{
    gw_jpeg_decoder_t *d = calloc(1, sizeof(*d));
    if (d != NULL) {
        d->scale_ok = true;
    }
    return d;
}

void gw_jpeg_destroy(gw_jpeg_decoder_t *dec)
{
    if (dec != NULL) {
        gw_jpeg_tjpgd_destroy(dec->rom);
        free(dec->scratch);
        free(dec);
    }
}

static plan_t make_plan(bool scale_allowed, unsigned w, unsigned h, unsigned max_w, unsigned max_h)
{
    /* Vừa khung, giữ tỉ lệ (phóng lên nếu ảnh nhỏ hơn khung). */
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

    plan_t p = {.mode = MODE_FALLBACK, .dw = dw, .dh = dh};
    if (dw == w && dh == h) {
        p.mode = MODE_NATIVE;
    } else if (scale_allowed && dw < w && dh < h) {
        const unsigned sw = dw & ~7u, sh = dh & ~7u;
        if (sw >= 8 && sh >= 8 && sw * 8 >= w && sh * 8 >= h) {
            p.mode = MODE_SCALE;
            p.dw = sw;
            p.dh = sh;
        }
    }
    return p;
}

static esp_err_t map_error(jpeg_error_t e)
{
    return (e == JPEG_ERR_UNSUPPORT_FMT || e == JPEG_ERR_UNSUPPORT_STD) ? ESP_ERR_NOT_SUPPORTED : ESP_FAIL;
}

/* Ghi lại bước lỗi + mã để hàm ngoài log (decode_fit chạy ở task giải nén, log thưa ở gw_jpeg_decode_fit). */
static esp_err_t fail_at(gw_jpeg_decoder_t *dec, const char *stage, int code, esp_err_t r)
{
    dec->err_stage = stage;
    dec->err_code = code;
    return r;
}

/*
 * Mở bộ giải nén với cấu hình thu nhỏ sw x sh (0 = không thu nhỏ) và đọc header.
 * jpeg_dec_parse_header DỊCH io->inbuf / io->inbuf_len qua phần header đã đọc, nên mỗi lần mở lại phải đặt io về đầu
 * ảnh — dùng lại io cũ thì lần parse sau đọc từ giữa dòng dữ liệu và luôn lỗi.
 */
static jpeg_error_t open_parse(unsigned sw, unsigned sh, const uint8_t *jpeg, size_t len, jpeg_dec_io_t *io,
                               jpeg_dec_handle_t *h, jpeg_dec_header_info_t *info)
{
    io->inbuf = (uint8_t *)jpeg;
    io->inbuf_len = (int)len;
    io->inbuf_remain = 0;
    jpeg_dec_config_t cfg = DEFAULT_JPEG_DEC_CONFIG();
    cfg.output_type = JPEG_PIXEL_FORMAT_RGB565_LE;
    cfg.scale.width = (uint16_t)sw;
    cfg.scale.height = (uint16_t)sh;
    jpeg_error_t e = jpeg_dec_open(&cfg, h);
    if (e != JPEG_ERR_OK) {
        return e;
    }
    e = jpeg_dec_parse_header(*h, io, info);
    if (e != JPEG_ERR_OK) {
        jpeg_dec_close(*h);
        *h = NULL;
    }
    return e;
}

/* Co/giãn điểm gần nhất sw x sh → dw x dh. */
static void resample_nearest(const uint16_t *src, unsigned sw, unsigned sh, uint16_t *dst, unsigned dw, unsigned dh,
                             uint16_t *xmap)
{
    for (unsigned x = 0; x < dw; x++) {
        xmap[x] = (uint16_t)((uint32_t)x * sw / dw);
    }
    for (unsigned y = 0; y < dh; y++) {
        const uint16_t *srow = src + (size_t)((uint32_t)y * sh / dh) * sw;
        uint16_t *drow = dst + (size_t)y * dw;
        for (unsigned x = 0; x < dw; x++) {
            drow[x] = srow[xmap[x]];
        }
    }
}

static esp_err_t decode_fit(gw_jpeg_decoder_t *dec, bool scale_allowed, const uint8_t *jpeg, size_t len, uint16_t *dst,
                            uint16_t max_w, uint16_t max_h, uint16_t *out_w, uint16_t *out_h);

/* SCALE lỗi ở khung này: chạy lại không SCALE. Đường đầy đủ thành công → lỗi là do SCALE, đếm; đủ SCALE_FAIL_MAX khung
 * liên tiếp thì tắt SCALE (log 1 lần). Đường đầy đủ cũng lỗi → khung hỏng thật, không đếm. */
static esp_err_t scale_failed(gw_jpeg_decoder_t *dec, const uint8_t *jpeg, size_t len, uint16_t *dst, uint16_t max_w,
                              uint16_t max_h, uint16_t *out_w, uint16_t *out_h, unsigned dw, unsigned dh, int code)
{
    esp_err_t r = decode_fit(dec, false, jpeg, len, dst, max_w, max_h, out_w, out_h);
    if (r == ESP_OK && dec->scale_ok && ++dec->scale_fails >= SCALE_FAIL_MAX) {
        ESP_LOGW(TAG, "decoder scale %ux%u failed %d frames in a row (last: %d) — using full-size decode + resample from now on",
                 dw, dh, SCALE_FAIL_MAX, code);
        dec->scale_ok = false;
    }
    return r;
}

static esp_err_t decode_fit(gw_jpeg_decoder_t *dec, bool scale_allowed, const uint8_t *jpeg, size_t len, uint16_t *dst,
                            uint16_t max_w, uint16_t max_h, uint16_t *out_w, uint16_t *out_h)
{
    if (dec == NULL || jpeg == NULL || len < 4 || len > INT32_MAX || dst == NULL || ((uintptr_t)dst & (ALIGN - 1)) != 0 ||
        max_w == 0 || max_h == 0 || max_w > MAX_DST_W || out_w == NULL || out_h == NULL) {
        return ESP_ERR_INVALID_ARG;
    }
    const size_t dst_cap = (size_t)max_w * max_h * sizeof(uint16_t);
    jpeg_dec_io_t io = {0};   /* open_parse đặt inbuf/inbuf_len mỗi lần mở */
    jpeg_dec_handle_t h = NULL;
    jpeg_dec_header_info_t info = {0};

    /*
     * Cấu hình thu nhỏ phải có lúc mở. Đoán theo khung trước (cùng cỡ gần như luôn đúng); sai thì mở lại 1 lần —
     * lần mở thứ hai khớp vì cấu hình lấy từ chính kế hoạch của khung này.
     */
    unsigned guess_w = 0, guess_h = 0;
    if (dec->last_w != 0) {
        plan_t g = make_plan(scale_allowed, dec->last_w, dec->last_h, max_w, max_h);
        if (g.mode == MODE_SCALE) {
            guess_w = g.dw;
            guess_h = g.dh;
        }
    }
    plan_t plan = {0};
    for (int attempt = 0; attempt < 2; attempt++) {
        jpeg_error_t e = open_parse(guess_w, guess_h, jpeg, len, &io, &h, &info);
        if (e != JPEG_ERR_OK) {
            if (guess_w != 0) {
                /* Thư viện từ chối cấu hình thu nhỏ ngay lúc mở/đọc header → giải lại khung này không thu nhỏ;
                 * scale_failed chỉ tính là lỗi SCALE nếu lần không thu nhỏ thành công (khung hỏng thật thì không). */
                return scale_failed(dec, jpeg, len, dst, max_w, max_h, out_w, out_h, guess_w, guess_h, (int)e);
            }
            return fail_at(dec, "open/parse header", (int)e, map_error(e));
        }
        if (info.width == 0 || info.height == 0) {
            jpeg_dec_close(h);
            return fail_at(dec, "header size 0", 0, ESP_FAIL);
        }
        plan = make_plan(scale_allowed, info.width, info.height, max_w, max_h);
        const unsigned need_w = plan.mode == MODE_SCALE ? plan.dw : 0;
        const unsigned need_h = plan.mode == MODE_SCALE ? plan.dh : 0;
        if (need_w == guess_w && need_h == guess_h) {
            break;
        }
        jpeg_dec_close(h);
        h = NULL;
        guess_w = need_w;
        guess_h = need_h;
    }
    if (h == NULL) {
        return fail_at(dec, "plan did not settle", 0, ESP_FAIL);
    }
    dec->last_w = info.width;
    dec->last_h = info.height;

    int outlen = 0;
    jpeg_error_t e = jpeg_dec_get_outbuf_len(h, &outlen);
    if (e != JPEG_ERR_OK || outlen <= 0) {
        jpeg_dec_close(h);
        return fail_at(dec, "get outbuf len", (int)e, ESP_FAIL);
    }
    if (plan.mode == MODE_SCALE && (size_t)outlen != (size_t)plan.dw * plan.dh * sizeof(uint16_t)) {
        /* thư viện không cho đúng kích thước đã yêu cầu: coi là lỗi SCALE, khung này dùng đường đầy đủ */
        jpeg_dec_close(h);
        return scale_failed(dec, jpeg, len, dst, max_w, max_h, out_w, out_h, plan.dw, plan.dh, -(int)outlen);
    }

    uint8_t *out = (uint8_t *)dst;
    if (plan.mode == MODE_FALLBACK || (size_t)outlen > dst_cap) {
        /* Giải nén nguyên kích thước (cấu hình không thu nhỏ → outlen = w*h*2) vào bộ đệm phụ rồi co/giãn. */
        if (plan.mode != MODE_FALLBACK) {
            plan.mode = MODE_FALLBACK;   /* kích thước ra lớn hơn dự kiến: chuyển hẳn sang FALLBACK */
        }
        const size_t need = (size_t)info.width * info.height * sizeof(uint16_t);
        if ((size_t)outlen != need) {
            /* handle đang mở với cấu hình thu nhỏ — mở lại không thu nhỏ để có ảnh nguyên kích thước */
            jpeg_dec_close(h);
            h = NULL;
            if (open_parse(0, 0, jpeg, len, &io, &h, &info) != JPEG_ERR_OK ||
                jpeg_dec_get_outbuf_len(h, &outlen) != JPEG_ERR_OK) {
                if (h != NULL) {
                    jpeg_dec_close(h);
                }
                return fail_at(dec, "reopen full size", 0, ESP_FAIL);
            }
        }
        if ((size_t)outlen > SCRATCH_MAX) {
            jpeg_dec_close(h);
            return fail_at(dec, "image too large", outlen, ESP_ERR_NO_MEM);
        }
        if (dec->scratch_cap < (size_t)outlen) {
            free(dec->scratch);
            dec->scratch = heap_caps_aligned_alloc(ALIGN, (size_t)outlen, MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT);
            dec->scratch_cap = dec->scratch != NULL ? (size_t)outlen : 0;
            if (dec->scratch == NULL) {
                jpeg_dec_close(h);
                return fail_at(dec, "scratch alloc (PSRAM)", outlen, ESP_ERR_NO_MEM);
            }
        }
        out = dec->scratch;
    }

    io.outbuf = out;
    e = jpeg_dec_process(h, &io);
    jpeg_dec_close(h);
    if (e != JPEG_ERR_OK) {
        if (plan.mode == MODE_SCALE) {
            return scale_failed(dec, jpeg, len, dst, max_w, max_h, out_w, out_h, plan.dw, plan.dh, (int)e);
        }
        return fail_at(dec, "process", (int)e, map_error(e));
    }

    if (plan.mode == MODE_SCALE) {
        dec->scale_fails = 0;   /* SCALE chạy tốt: các lỗi trước đó không còn "liên tiếp" */
    }
    if (plan.mode == MODE_FALLBACK) {
        resample_nearest((const uint16_t *)dec->scratch, info.width, info.height, dst, plan.dw, plan.dh, dec->xmap);
    }
    *out_w = (uint16_t)plan.dw;
    *out_h = (uint16_t)plan.dh;
    return ESP_OK;
}

/* Log cấu trúc JPEG tới SOS (chỉ đọc header, giới hạn bởi len) — để biết vì sao esp_new_jpeg từ chối khung camera. */
static void log_jpeg_layout(const uint8_t *j, size_t len)
{
    unsigned sof = 0, w = 0, h = 0, ncomp = 0, dri = 0, dht = 0, dqt = 0, app = 0;
    uint8_t samp[3] = {0};
    bool sos = false;
    size_t p = 2;   /* sau SOI */
    while (p + 4 <= len && j[p] == 0xFF) {
        const uint8_t m = j[p + 1];
        if (m == 0xFF) {   /* byte đệm giữa các marker */
            p++;
            continue;
        }
        const size_t seg = ((size_t)j[p + 2] << 8) | j[p + 3];   /* gồm 2 byte độ dài */
        if (seg < 2 || p + 2 + seg > len) {
            break;
        }
        const uint8_t *s = j + p + 4;
        const size_t body = seg - 2;
        if (m >= 0xC0 && m <= 0xCF && m != 0xC4 && m != 0xC8 && m != 0xCC) {
            sof = m;
            if (body >= 6) {
                h = ((unsigned)s[1] << 8) | s[2];
                w = ((unsigned)s[3] << 8) | s[4];
                ncomp = s[5];
                for (unsigned i = 0; i < ncomp && i < 3 && 6 + 3 * i + 1 < body; i++) {
                    samp[i] = s[6 + 3 * i + 1];
                }
            }
        } else if (m == 0xC4) {
            dht++;
        } else if (m == 0xDB) {
            dqt++;
        } else if (m == 0xDD) {
            dri = body >= 2 ? (((unsigned)s[0] << 8) | s[1]) : 0;
        } else if (m >= 0xE0 && m <= 0xEF) {
            app++;
        } else if (m == 0xDA) {
            sos = true;
            break;
        }
        p += 2 + seg;
    }
    const bool eoi = len >= 2 && j[len - 2] == 0xFF && j[len - 1] == 0xD9;
    ESP_LOGW(TAG, "  frame layout: SOF 0x%02X %ux%u comps=%u sampling=%02X/%02X/%02X DQT=%u DHT=%u DRI=%u APP=%u "
                  "SOS=%s EOI-at-end=%s",
             sof, w, h, ncomp, samp[0], samp[1], samp[2], dqt, dht, dri, app, sos ? "yes" : "no", eoi ? "yes" : "no");
}

esp_err_t gw_jpeg_decode_fit(gw_jpeg_decoder_t *dec, const uint8_t *jpeg, size_t len, uint16_t *dst, uint16_t max_w,
                             uint16_t max_h, uint16_t *out_w, uint16_t *out_h)
{
    if (dec == NULL) {
        return ESP_ERR_INVALID_ARG;
    }
    if (!dec->esp_off) {
        dec->err_stage = NULL;
        dec->err_code = 0;
        esp_err_t r = decode_fit(dec, dec->scale_ok, jpeg, len, dst, max_w, max_h, out_w, out_h);
        if (r == ESP_OK) {
            dec->esp_ever_ok = true;
            dec->esp_fail_streak = 0;
            return ESP_OK;
        }
        if (r == ESP_ERR_INVALID_ARG) {
            return r;
        }
        dec->esp_fail_total++;
        if (dec->esp_fail_total <= ESP_FAIL_LOG_FIRST || dec->esp_fail_total % ESP_FAIL_LOG_EVERY == 0) {
            ESP_LOGW(TAG, "esp_new_jpeg failed at '%s' (code %d, %s) on a %u-byte frame [%" PRIu32 " failures] — "
                          "decoding with ROM TJpgDec",
                     dec->err_stage != NULL ? dec->err_stage : "?", dec->err_code, esp_err_to_name(r), (unsigned)len,
                     dec->esp_fail_total);
            if (dec->esp_fail_total <= ESP_FAIL_LOG_FIRST) {
                log_jpeg_layout(jpeg, len);
            }
        }
        if (!dec->esp_ever_ok && ++dec->esp_fail_streak >= ESP_GIVE_UP_FRAMES) {
            dec->esp_off = true;
            ESP_LOGW(TAG, "esp_new_jpeg has not decoded any frame from this camera after %d tries — using ROM TJpgDec "
                          "from now on (slower)",
                     ESP_GIVE_UP_FRAMES);
        }
    }
    /* Đường lui: TJpgDec trong ROM — cùng hợp đồng (RGB565 của LVGL, vừa khung, giữ tỉ lệ). */
    if (dec->rom == NULL) {
        dec->rom = gw_jpeg_tjpgd_create();
        if (dec->rom == NULL) {
            return ESP_ERR_NO_MEM;
        }
    }
    return gw_jpeg_tjpgd_decode_fit(dec->rom, jpeg, len, dst, max_w, max_h, out_w, out_h);
}
