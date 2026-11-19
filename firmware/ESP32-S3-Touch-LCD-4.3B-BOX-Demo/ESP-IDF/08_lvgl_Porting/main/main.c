/*
 * Gateway Smart Home — ESP32-S3-Touch-LCD-4.3B-BOX (bản sơ bộ).
 * main chỉ gọi tầng application; logic nằm trong components/{drivers,services,ui,application} (README).
 */
#include "gw_app.h"

void app_main(void)
{
    /* Lỗi đã được log (và hiện lên màn hình) trong gw_app_start; không reset liên tục khi thiếu NVS. */
    gw_app_start();
}
