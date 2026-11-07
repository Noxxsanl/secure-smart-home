/*
 * ESP32-CAM — camera cửa của bộ demo Smart Home (bản sơ bộ).
 * main chỉ gọi tầng application; logic nằm trong components/{drivers,services,application} (README).
 */
#include "cam_app.h"

void app_main(void)
{
    /* Lỗi đã được log trong cam_app_start; dừng ở đây để không reset liên tục khi thiếu NVS/phần cứng. */
    cam_app_start();
}
