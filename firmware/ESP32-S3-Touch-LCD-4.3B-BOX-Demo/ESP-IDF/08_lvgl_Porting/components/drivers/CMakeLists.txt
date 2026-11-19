# Tầng drivers — phần cứng của board Waveshare ESP32-S3-Touch-LCD-4.3B-BOX:
#   src/lcd/     LCD RGB 800x480 + cảm ứng GT911 + LVGL port: code ví dụ 08_lvgl_Porting của Waveshare, GIỮ NGUYÊN
#                (chỉ chuyển từ main/ sang). Kconfig.projbuild (menu "Example Configuration") và idf_component.yml
#                (lvgl/lvgl 8.x, esp_lcd_touch_gt911) cũng của ví dụ.
#   gw_display   bọc ví dụ cho tầng trên: khởi tạo LCD + LVGL, khoá LVGL, đèn nền.
#   gw_i2c       bus I2C chung GPIO8/9 (cảm ứng, CH422G, RTC) — một bus, một driver (IOT_NODE_NETWORK §3.2).
#   gw_rtc       RTC PCF85063 giữ giờ khi mất điện / mất Internet (IOT_NODE_NETWORK §7).
#
# Code Waveshare dùng driver I2C CŨ (driver/i2c.h). ESP-IDF 5 abort lúc khởi động nếu link cả driver mới
# (driver/i2c_master.h), nên MỌI code I2C của gateway dùng driver cũ qua gw_i2c.
#
# Không biết services/ui/application. lvgl public: tầng ui gọi lv_* trực tiếp (giữa gw_display_lock/unlock).
idf_component_register(SRCS "src/lcd/waveshare_rgb_lcd_port.c"
                            "src/lcd/lvgl_port.c"
                            "src/gw_display.c"
                            "src/gw_i2c.c"
                            "src/gw_rtc.c"
                       INCLUDE_DIRS "include"
                       PRIV_INCLUDE_DIRS "src/lcd"
                       REQUIRES lvgl__lvgl esp_common
                       PRIV_REQUIRES driver esp_driver_gpio esp_lcd esp_timer
                                     espressif__esp_lcd_touch espressif__esp_lcd_touch_gt911)

# LVGL 8 sinh cảnh báo format khi build với ESP-IDF 5 — tắt riêng cho thư viện này (như ví dụ Waveshare)
idf_component_get_property(lvgl_lib lvgl__lvgl COMPONENT_LIB)
target_compile_options(${lvgl_lib} PRIVATE -Wno-format)
