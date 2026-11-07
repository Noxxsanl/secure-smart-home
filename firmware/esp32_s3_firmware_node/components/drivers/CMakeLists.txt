# Tầng drivers — phần cứng của Node phòng khách. Chia theo THIẾT BỊ, dùng driver bus có sẵn của ESP-IDF.
#   bus/      I2C master, SPI master dùng chung
#   sensors/  SHT3x, AHT20 (nhiệt/ẩm), BH1750 (ánh sáng) — I2C
#   audio/    mic INMP441 (I2S RX), loa qua ampli I2S (I2S TX)
#   ir/       LED phát 940 nm (RMT TX + sóng mang 38 kHz), mắt thu VS1838B (RMT RX), mã NEC
#   relay/    relay HF46F qua transistor/opto
#   lcd/      TFT 3.5" ILI9488 SPI (esp_lcd panel, RGB565 → RGB666)
#
# Không chứa chân GPIO cứng: chân truyền qua struct *_config_t lúc init (chờ chốt sơ đồ chân).
# Không phụ thuộc services/application.
# Header public lộ kiểu của i2c_master, spi_master, i2s, esp_lcd → REQUIRES (public) các component đó.
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
                            "src/lcd/drv_ili9488.c"
                       INCLUDE_DIRS "include"
                       PRIV_INCLUDE_DIRS "src"
                       REQUIRES esp_driver_i2c esp_driver_spi esp_driver_i2s esp_lcd
                       PRIV_REQUIRES esp_driver_gpio esp_driver_rmt esp_driver_ledc esp_timer)
