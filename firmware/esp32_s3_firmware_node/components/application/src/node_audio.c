#include "node_audio.h"

#include <stdatomic.h>
#include <stdlib.h>

#include "board_audio.h"
#include "esp_log.h"
#include "freertos/FreeRTOS.h"
#include "freertos/queue.h"
#include "freertos/task.h"
#include "sdkconfig.h"

static const char *TAG = "node_audio";

#define AUDIO_QUEUE_LEN 4
#define AUDIO_TASK_STACK 3072
#define AUDIO_TASK_PRIO 2
#define SELFTEST_CHUNK_MS 100
#define SELFTEST_LOG_EVERY 50   /* 50 × 100 ms = 5 s */

static QueueHandle_t s_queue;   /* node_audio_beep_t */
static atomic_bool s_ready;

static void play_beep(node_audio_beep_t kind)
{
    if (!board_audio_speaker_ready()) {
        return;
    }
    switch (kind) {
    case NODE_AUDIO_BEEP_ON:
        board_audio_tone(1320, 70);
        break;
    case NODE_AUDIO_BEEP_OFF:
        board_audio_tone(880, 70);
        break;
    case NODE_AUDIO_BEEP_ERROR:
    default:
        board_audio_tone(330, 250);
        break;
    }
}

#if CONFIG_NODE_AUDIO_MIC_SELFTEST
/* [Thử mic] đọc 100 ms/lần, log mức to nhất và trung bình mỗi 5 s; vẫn phát bíp xen giữa. */
static void selftest_loop(void)
{
    const size_t n = board_audio_sample_rate() * SELFTEST_CHUNK_MS / 1000;
    int16_t *pcm = malloc(n * sizeof(int16_t));
    if (pcm == NULL) {
        ESP_LOGW(TAG, "mic self-test: no memory");
        return;
    }
    ESP_LOGI(TAG, "mic self-test: logging level every 5 s (speak / clap near the mic)");
    float peak = -96.0f;
    float sum = 0;
    unsigned count = 0;
    for (;;) {
        node_audio_beep_t kind;
        if (xQueueReceive(s_queue, &kind, 0) == pdTRUE) {
            play_beep(kind);
        }
        size_t got = 0;
        if (board_audio_mic_read(pcm, n, &got, SELFTEST_CHUNK_MS * 2) != ESP_OK || got == 0) {
            vTaskDelay(pdMS_TO_TICKS(SELFTEST_CHUNK_MS));
            continue;
        }
        float db = board_audio_level_dbfs(pcm, got);
        peak = db > peak ? db : peak;
        sum += db;
        if (++count == SELFTEST_LOG_EVERY) {
            ESP_LOGI(TAG, "mic level: avg %.1f dBFS, peak %.1f dBFS (silence ~ -70, voice ~ -40..-20)",
                     (double)(sum / (float)count), (double)peak);
            peak = -96.0f;
            sum = 0;
            count = 0;
        }
    }
}
#endif

static void audio_task(void *arg)
{
    (void)arg;
#if CONFIG_NODE_AUDIO_MIC_SELFTEST
    if (board_audio_mic_ready()) {
        selftest_loop();   /* chỉ trả về khi thiếu bộ nhớ */
    }
#endif
    node_audio_beep_t kind;
    for (;;) {
        if (xQueueReceive(s_queue, &kind, portMAX_DELAY) == pdTRUE) {
            play_beep(kind);
        }
    }
}

esp_err_t node_audio_start(void)
{
    if (atomic_load(&s_ready)) {
        return ESP_OK;
    }
    esp_err_t err = board_audio_init();
    if (err != ESP_OK) {
        return err;   /* ESP_ERR_NOT_SUPPORTED: tắt trong menuconfig (mặc định) */
    }
    s_queue = xQueueCreate(AUDIO_QUEUE_LEN, sizeof(node_audio_beep_t));
    if (s_queue == NULL || xTaskCreate(audio_task, "audio", AUDIO_TASK_STACK, NULL, AUDIO_TASK_PRIO, NULL) != pdPASS) {
        ESP_LOGE(TAG, "cannot start audio task (no memory)");
        return ESP_ERR_NO_MEM;
    }
    atomic_store(&s_ready, true);
    ESP_LOGI(TAG, "audio ready: mic %s, speaker %s, %u Hz", board_audio_mic_ready() ? "ok" : "missing",
             board_audio_speaker_ready() ? "ok" : "missing", (unsigned)board_audio_sample_rate());
    return ESP_OK;
}

bool node_audio_ready(void)
{
    return atomic_load(&s_ready);
}

void node_audio_beep(node_audio_beep_t kind)
{
#if CONFIG_NODE_AUDIO_BEEP_ON_ACTION
    if (atomic_load(&s_ready)) {
        xQueueSend(s_queue, &kind, 0);   /* đầy thì bỏ: bíp chỉ là phản hồi */
    }
#else
    (void)kind;
#endif
}

esp_err_t node_audio_play_pcm(const int16_t *pcm, size_t samples, uint32_t timeout_ms)
{
    if (!atomic_load(&s_ready)) {
        return ESP_ERR_INVALID_STATE;
    }
    return board_audio_play(pcm, samples, timeout_ms);
}

esp_err_t node_audio_read_mic(int16_t *pcm, size_t max_samples, size_t *got, uint32_t timeout_ms)
{
    if (!atomic_load(&s_ready)) {
        return ESP_ERR_INVALID_STATE;
    }
    return board_audio_mic_read(pcm, max_samples, got, timeout_ms);
}

uint32_t node_audio_sample_rate(void)
{
    return board_audio_sample_rate();
}
