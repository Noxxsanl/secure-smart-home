# Tầng ui — giao diện LVGL trên màn hình Gateway (IOT_NODE_NETWORK §3.3): màn hình trạng thái + xem trực tiếp camera.
# Chỉ dùng drivers (gw_display: khoá LVGL); không biết services/application — dữ liệu được đẩy vào qua gw_ui_set_*.
#   gw_ui     màn hình, mô hình dữ liệu, ảnh camera (2 bộ đệm RGB565 trong PSRAM)
#   gw_jpeg   giải nén JPEG bằng TJpgDec trong ROM ESP32-S3 (esp_rom) — header riêng trong src/
idf_component_register(SRCS "src/gw_ui.c"
                            "src/gw_jpeg.c"
                       INCLUDE_DIRS "include"
                       REQUIRES esp_common
                       PRIV_REQUIRES drivers json esp_timer esp_rom)
