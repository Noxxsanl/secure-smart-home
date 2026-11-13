# Tầng drivers — phần cứng của Node phòng khách. Chia theo THIẾT BỊ, dùng driver bus có sẵn của ESP-IDF.
#   bus/      I2C master, SPI master dùng chung
#   sensors/  SHT3x, AHT20 (nhiệt/ẩm), BH1750 (ánh sáng) — I2C
#   audio/    mic INMP441 (I2S RX), loa qua ampli I2S (I2S TX)
#   ir/       LED phát 940 nm (RMT TX + sóng mang 38 kHz), mắt thu VS1838B (RMT RX), mã NEC
#   relay/    relay HF46F qua transistor/opto
#   stepper/  động cơ bước 4 pha 28BYJ-48 qua ULN2003 (nửa bước, đếm bước bằng esp_timer)
#   led/      LED địa chỉ hoá WS2812B/SK6812 (RMT TX, copy encoder)
#   lcd/      TFT 3.5" ILI9488 SPI (esp_lcd panel, RGB565 → RGB666) + drv_display: LVGL 8.4 trên panel đó
#             (tick, task lv_timer_handler, khoá, thiết bị trỏ). LVGL 8.4 ở components/lvgl__lvgl như Gateway.
#   touch/    cảm ứng điện trở XPT2046 của module 3.5" (SPI chung bus LCD, lọc trung vị, hiệu chuẩn 4 mép)
#
# Không chứa chân GPIO cứng: chân truyền qua struct *_config_t lúc init (chờ chốt sơ đồ chân).
# Không phụ thuộc services/application.
# Header public lộ kiểu của i2c_master, spi_master, i2s, esp_lcd, lvgl → REQUIRES (public) các component đó.
idf_component_register(SRCS "src/bus/drv_bus.c"
                            "src/sensors/drv_sht3x.c"
                            "src/sensors/drv_aht20.c"
                            "src/sensors/drv_bh1750.c"
                            "src/audio/drv_mic.c"
                            "src/audio/drv_speaker.c"
                            "src/ir/drv_ir_nec.c"
                            "src/ir/drv_ir_tx.c"
                            "src/ir/drv_ir_rx.c"
                            "src/relay/drv_relay.c"
                            "src/stepper/drv_stepper.c"
                            "src/led/drv_ws2812.c"
                            "src/lcd/drv_ili9488.c"
                            "src/lcd/drv_display.c"
                            "src/touch/drv_xpt2046.c"
                       INCLUDE_DIRS "include"
                       PRIV_INCLUDE_DIRS "src"
                       REQUIRES esp_driver_i2c esp_driver_spi esp_driver_i2s esp_lcd lvgl__lvgl
                       PRIV_REQUIRES esp_driver_gpio esp_driver_rmt esp_driver_ledc esp_timer)

# LVGL 8 sinh cảnh báo format khi build với ESP-IDF 5 — tắt riêng cho thư viện này (như Gateway)
idf_component_get_property(lvgl_lib lvgl__lvgl COMPONENT_LIB)
target_compile_options(${lvgl_lib} PRIVATE -Wno-format)
