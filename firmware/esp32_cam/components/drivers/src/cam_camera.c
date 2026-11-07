#include "cam_camera.h"

#include <string.h>

#include "esp_log.h"
#include "freertos/FreeRTOS.h"
#include "freertos/semphr.h"

static const char *TAG = "cam_camera";

#define SNAPSHOT_FRAMESIZE FRAMESIZE_SVGA

/* Sơ đồ chân ESP32-CAM AI-Thinker (ESP_IDF_BUILD §2.3). Cần đối chiếu với module thật (IOT_NODE_NETWORK Q2). */
static camera_config_t s_cfg = {
    .pin_pwdn = 32,
    .pin_reset = -1,
    .pin_xclk = 0,
    .pin_sccb_sda = 26,
    .pin_sccb_scl = 27,
    .pin_d7 = 35,
    .pin_d6 = 34,
    .pin_d5 = 39,
    .pin_d4 = 36,
    .pin_d3 = 21,
    .pin_d2 = 19,
    .pin_d1 = 18,
    .pin_d0 = 5,
    .pin_vsync = 25,
    .pin_href = 23,
    .pin_pclk = 22,

    .xclk_freq_hz = 20000000,
    .ledc_timer = LEDC_TIMER_0,
    .ledc_channel = LEDC_CHANNEL_0,

    .pixel_format = PIXFORMAT_JPEG,
    .frame_size = SNAPSHOT_FRAMESIZE,
    .jpeg_quality = 12,
    .fb_count = 2,
    .fb_location = CAMERA_FB_IN_PSRAM,
    .grab_mode = CAMERA_GRAB_LATEST,   /* luôn lấy khung mới nhất, bỏ khung cũ khi mạng chậm */
};

/* Khoá đổi cấu hình cảm biến và chụp ảnh — vòng lặp luồng lấy khung không cần khoá. */
static SemaphoreHandle_t s_lock;
static int s_snapshot_quality;

/* Sau khi đổi kích thước, 1-2 khung đầu có thể còn kích thước cũ — bỏ đi. */
static void drop_frames(int n)
{
    for (int i = 0; i < n; i++) {
        camera_fb_t *fb = esp_camera_fb_get();
        if (fb) {
            esp_camera_fb_return(fb);
        }
    }
}

esp_err_t cam_camera_init(int jpeg_quality)
{
    s_lock = xSemaphoreCreateMutex();
    if (s_lock == NULL) {
        return ESP_ERR_NO_MEM;
    }
    s_snapshot_quality = jpeg_quality;
    s_cfg.jpeg_quality = jpeg_quality;

    esp_err_t err = esp_camera_init(&s_cfg);
    if (err != ESP_OK) {
        /* 0x105 (ESP_ERR_NOT_FOUND) thường do cáp camera lỏng hoặc sai sơ đồ chân. */
        ESP_LOGE(TAG, "camera init failed: %s", esp_err_to_name(err));
        return err;
    }
    ESP_LOGI(TAG, "OV2640 ready (SVGA, q=%d)", jpeg_quality);
    return ESP_OK;
}

esp_err_t cam_camera_capture_copy(uint8_t *dst, size_t cap, size_t *out_len)
{
    xSemaphoreTake(s_lock, portMAX_DELAY);
    camera_fb_t *fb = esp_camera_fb_get();
    if (fb == NULL) {
        xSemaphoreGive(s_lock);
        ESP_LOGE(TAG, "capture failed");
        return ESP_FAIL;
    }

    esp_err_t err = ESP_OK;
    if (fb->len > cap) {
        ESP_LOGW(TAG, "frame %u bytes > limit %u", (unsigned)fb->len, (unsigned)cap);
        err = ESP_ERR_INVALID_SIZE;
    } else {
        memcpy(dst, fb->buf, fb->len);
        *out_len = fb->len;
        ESP_LOGI(TAG, "captured %ux%u, %u bytes", (unsigned)fb->width, (unsigned)fb->height, (unsigned)fb->len);
    }
    esp_camera_fb_return(fb);
    xSemaphoreGive(s_lock);
    return err;
}

esp_err_t cam_camera_stream_begin(framesize_t size, int quality)
{
    sensor_t *s = esp_camera_sensor_get();
    if (s == NULL) {
        return ESP_FAIL;
    }
    xSemaphoreTake(s_lock, portMAX_DELAY);
    s->set_framesize(s, size);
    s->set_quality(s, quality);
    drop_frames(2);
    xSemaphoreGive(s_lock);
    return ESP_OK;
}

void cam_camera_stream_end(void)
{
    sensor_t *s = esp_camera_sensor_get();
    if (s == NULL) {
        return;
    }
    xSemaphoreTake(s_lock, portMAX_DELAY);
    s->set_framesize(s, SNAPSHOT_FRAMESIZE);
    s->set_quality(s, s_snapshot_quality);
    drop_frames(2);
    xSemaphoreGive(s_lock);
}

camera_fb_t *cam_camera_fb_get(void)
{
    return esp_camera_fb_get();
}

void cam_camera_fb_return(camera_fb_t *fb)
{
    esp_camera_fb_return(fb);
}
