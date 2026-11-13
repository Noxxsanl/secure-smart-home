#include "board_loads.h"

#include "drv_relay.h"
#include "drv_stepper.h"
#include "esp_check.h"
#include "esp_log.h"
#include "sdkconfig.h"

static const char *TAG = "board_loads";

static drv_relay_handle_t s_relay;
static drv_stepper_handle_t s_motor;
#if CONFIG_NODE_CURTAIN_ENABLE
static board_curtain_done_cb_t s_done_cb;
static void *s_done_ctx;
#endif

/* ---- relay đèn, quạt ---------------------------------------------------------------------------------- */

esp_err_t board_relays_init(void)
{
#if CONFIG_NODE_RELAY_ENABLE
    if (s_relay != NULL) {
        return ESP_OK;
    }
#if CONFIG_NODE_RELAY_ACTIVE_HIGH
    const bool active_high = true;
#else
    const bool active_high = false;
#endif
    const drv_relay_channel_t ch[BOARD_RELAY_COUNT] = {
        [BOARD_RELAY_LAMP] = {.gpio = CONFIG_NODE_RELAY_LAMP_GPIO, .active_high = active_high},
        [BOARD_RELAY_FAN] = {.gpio = CONFIG_NODE_RELAY_FAN_GPIO, .active_high = active_high},
    };
    ESP_RETURN_ON_FALSE(ch[BOARD_RELAY_LAMP].gpio != ch[BOARD_RELAY_FAN].gpio, ESP_ERR_INVALID_ARG, TAG,
                        "lamp and fan relays on the same GPIO %d", ch[BOARD_RELAY_LAMP].gpio);
    const drv_relay_config_t cfg = {
        .channels = ch,
        .count = BOARD_RELAY_COUNT,
        .min_switch_interval_ms = CONFIG_NODE_RELAY_MIN_SWITCH_MS,
    };
    ESP_RETURN_ON_ERROR(drv_relay_init(&cfg, &s_relay), TAG, "relays on GPIO %d/%d", ch[BOARD_RELAY_LAMP].gpio,
                        ch[BOARD_RELAY_FAN].gpio);
    ESP_LOGI(TAG, "relays: lamp GPIO %d, fan GPIO %d (active %s)", ch[BOARD_RELAY_LAMP].gpio, ch[BOARD_RELAY_FAN].gpio,
             active_high ? "high" : "low");
    return ESP_OK;
#else
    return ESP_ERR_NOT_SUPPORTED;
#endif
}

bool board_relays_ready(void)
{
    return s_relay != NULL;
}

esp_err_t board_relay_set(board_relay_t relay, bool on)
{
    ESP_RETURN_ON_FALSE(s_relay != NULL, ESP_ERR_INVALID_STATE, TAG, "relays not initialised");
    ESP_RETURN_ON_FALSE((unsigned)relay < BOARD_RELAY_COUNT, ESP_ERR_INVALID_ARG, TAG, "bad relay");
    return drv_relay_set(s_relay, (size_t)relay, on);
}

bool board_relay_get(board_relay_t relay)
{
    bool on = false;
    if (s_relay != NULL && (unsigned)relay < BOARD_RELAY_COUNT) {
        drv_relay_get(s_relay, (size_t)relay, &on);
    }
    return on;
}

/* ---- động cơ rèm -------------------------------------------------------------------------------------- */

#if CONFIG_NODE_CURTAIN_ENABLE
static void on_motor_done(int32_t position, bool reached, void *ctx)
{
    (void)ctx;
    if (s_done_cb != NULL) {
        s_done_cb(position, reached, s_done_ctx);
    }
}
#endif

esp_err_t board_curtain_init(board_curtain_done_cb_t done_cb, void *ctx)
{
#if CONFIG_NODE_CURTAIN_ENABLE
    if (s_motor != NULL) {
        return ESP_OK;
    }
    const drv_stepper_config_t cfg = {
        .gpio = {CONFIG_NODE_CURTAIN_IN1_GPIO, CONFIG_NODE_CURTAIN_IN2_GPIO, CONFIG_NODE_CURTAIN_IN3_GPIO,
                 CONFIG_NODE_CURTAIN_IN4_GPIO},
        .step_period_us = CONFIG_NODE_CURTAIN_STEP_US,
#if CONFIG_NODE_CURTAIN_INVERT
        .invert_dir = true,
#endif
    };
    s_done_cb = done_cb;
    s_done_ctx = ctx;
    ESP_RETURN_ON_ERROR(drv_stepper_init(&cfg, &s_motor), TAG, "curtain motor");
    drv_stepper_set_done_cb(s_motor, on_motor_done, NULL);
    return ESP_OK;
#else
    (void)done_cb;
    (void)ctx;
    return ESP_ERR_NOT_SUPPORTED;
#endif
}

bool board_curtain_ready(void)
{
    return s_motor != NULL;
}

int32_t board_curtain_default_travel(void)
{
#if CONFIG_NODE_CURTAIN_ENABLE
    return CONFIG_NODE_CURTAIN_TRAVEL_STEPS;
#else
    return 0;
#endif
}

esp_err_t board_curtain_move_to(int32_t position)
{
    ESP_RETURN_ON_FALSE(s_motor != NULL, ESP_ERR_INVALID_STATE, TAG, "curtain motor not initialised");
    return drv_stepper_move_to(s_motor, position);
}

esp_err_t board_curtain_stop(void)
{
    ESP_RETURN_ON_FALSE(s_motor != NULL, ESP_ERR_INVALID_STATE, TAG, "curtain motor not initialised");
    return drv_stepper_stop(s_motor);
}

esp_err_t board_curtain_set_position(int32_t position)
{
    ESP_RETURN_ON_FALSE(s_motor != NULL, ESP_ERR_INVALID_STATE, TAG, "curtain motor not initialised");
    return drv_stepper_set_position(s_motor, position);
}

int32_t board_curtain_position(void)
{
    return drv_stepper_position(s_motor);   /* NULL → 0 */
}

bool board_curtain_moving(void)
{
    return drv_stepper_is_moving(s_motor);   /* NULL → false */
}
