#include "gw_rtc.h"

#include <stdbool.h>
#include <time.h>

#include "driver/i2c.h"
#include "esp_check.h"
#include "esp_log.h"
#include "freertos/FreeRTOS.h"
#include "gw_i2c.h"

static const char *TAG = "gw_rtc";

#define PCF85063_ADDR 0x51
#define REG_CTRL1 0x00
#define REG_SECONDS 0x04          /* 0x04..0x0A: giây, phút, giờ, ngày, thứ, tháng, năm (BCD) */
#define CTRL1_STOP 0x20
#define CTRL1_12_24 0x02
#define SECONDS_OS 0x80           /* oscillator stop: mất nguồn, giờ không tin được */

#define TS_MIN INT64_C(1700000000)   /* 2023-11-14 */
#define TS_MAX INT64_C(4102444799)   /* 2099-12-31 */

static TickType_t i2c_ticks(void)
{
    return pdMS_TO_TICKS(GW_I2C_TIMEOUT_MS);
}

static esp_err_t read_regs(uint8_t reg, uint8_t *buf, size_t len)
{
    return i2c_master_write_read_device(GW_I2C_PORT, PCF85063_ADDR, &reg, 1, buf, len, i2c_ticks());
}

static esp_err_t write_regs(const uint8_t *buf, size_t len)
{
    return i2c_master_write_to_device(GW_I2C_PORT, PCF85063_ADDR, buf, len, i2c_ticks());
}

static uint8_t bcd2bin(uint8_t v)
{
    return (uint8_t)((v >> 4) * 10 + (v & 0x0f));
}

static uint8_t bin2bcd(unsigned v)
{
    return (uint8_t)(((v / 10) << 4) | (v % 10));
}

/* Số ngày từ 1970-01-01 (H. Hinnant, days_from_civil) — newlib của ESP-IDF không có timegm. */
static int64_t days_from_civil(int y, unsigned m, unsigned d)
{
    y -= (m <= 2);
    const int era = (y >= 0 ? y : y - 399) / 400;
    const unsigned yoe = (unsigned)(y - era * 400);
    const unsigned doy = (153 * (m > 2 ? m - 3 : m + 9) + 2) / 5 + d - 1;
    const unsigned doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    return (int64_t)era * 146097 + (int64_t)doe - 719468;
}

esp_err_t gw_rtc_init(void)
{
    ESP_RETURN_ON_ERROR(gw_i2c_bus_init(), TAG, "I2C bus");
    uint8_t ctrl1 = 0;
    esp_err_t err = read_regs(REG_CTRL1, &ctrl1, 1);
    if (err != ESP_OK) {
        ESP_LOGW(TAG, "PCF85063 not responding: %s", esp_err_to_name(err));
        return err;
    }
    /* Đồng hồ phải chạy, chế độ 24 giờ; giữ nguyên bit tụ dao động (CAP_SEL) của board. */
    if (ctrl1 & (CTRL1_STOP | CTRL1_12_24)) {
        uint8_t buf[2] = {REG_CTRL1, (uint8_t)(ctrl1 & ~(CTRL1_STOP | CTRL1_12_24))};
        ESP_RETURN_ON_ERROR(write_regs(buf, sizeof(buf)), TAG, "write ctrl1");
    }
    return ESP_OK;
}

esp_err_t gw_rtc_read(int64_t *unix_ts)
{
    ESP_RETURN_ON_FALSE(unix_ts, ESP_ERR_INVALID_ARG, TAG, "null arg");
    uint8_t r[7];
    ESP_RETURN_ON_ERROR(read_regs(REG_SECONDS, r, sizeof(r)), TAG, "read time");
    if (r[0] & SECONDS_OS) {
        return ESP_ERR_INVALID_STATE;
    }
    unsigned sec = bcd2bin(r[0] & 0x7f);
    unsigned min = bcd2bin(r[1] & 0x7f);
    unsigned hour = bcd2bin(r[2] & 0x3f);
    unsigned day = bcd2bin(r[3] & 0x3f);
    unsigned month = bcd2bin(r[5] & 0x1f);
    int year = 2000 + bcd2bin(r[6]);
    if (sec > 59 || min > 59 || hour > 23 || day < 1 || day > 31 || month < 1 || month > 12) {
        return ESP_ERR_INVALID_STATE;
    }
    int64_t ts = days_from_civil(year, month, day) * 86400 + hour * 3600 + min * 60 + sec;
    if (ts < TS_MIN || ts > TS_MAX) {
        return ESP_ERR_INVALID_STATE;
    }
    *unix_ts = ts;
    return ESP_OK;
}

esp_err_t gw_rtc_write(int64_t unix_ts)
{
    ESP_RETURN_ON_FALSE(unix_ts >= TS_MIN && unix_ts <= TS_MAX, ESP_ERR_INVALID_ARG, TAG, "time out of range");
    time_t t = (time_t)unix_ts;
    struct tm tm;
    gmtime_r(&t, &tm);
    uint8_t buf[8] = {
        REG_SECONDS,
        bin2bcd((unsigned)tm.tm_sec),   /* bit OS = 0: xoá cờ mất dao động */
        bin2bcd((unsigned)tm.tm_min),
        bin2bcd((unsigned)tm.tm_hour),
        bin2bcd((unsigned)tm.tm_mday),
        (uint8_t)tm.tm_wday,
        bin2bcd((unsigned)tm.tm_mon + 1),
        bin2bcd((unsigned)(tm.tm_year - 100)),
    };
    return write_regs(buf, sizeof(buf));
}
