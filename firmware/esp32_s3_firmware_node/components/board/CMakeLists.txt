# Tầng board — chỗ DUY NHẤT biết chân GPIO của Node (README, mục Màn hình / Khi chốt GPIO).
#   board_display   bus SPI2 → TFT ILI9488 → LVGL 8.4 → cảm ứng XPT2046. Chân, hướng, hiệu chuẩn lấy từ
#                   Kconfig.projbuild (menuconfig "Node S3: màn hình"), tương đương gw_display của Gateway.
#   board_sensors   bus I2C (SDA/SCL trong menuconfig "Node S3: cảm biến I2C") → SHT31 nhiệt độ/độ ẩm (tự tìm 0x44/0x45).
#   board_ir        mắt thu VS1838B (RMT RX + DMA) + LED IR 940 nm (RMT TX 38 kHz), chân trong menuconfig
#                   "Node S3: hồng ngoại (điều hòa)" (mặc định RX GPIO1, TX GPIO2).
#   board_loads     relay HF46F 12 V đèn (GPIO41) / quạt (GPIO42) + động cơ bước 28BYJ-48 qua ULN2003 cho rèm
#                   (IN1..IN4 = GPIO8, 18, 17, 16), menuconfig "Node S3: relay" / "Node S3: rèm cửa".
#   board_led       LED RGB WS2812 báo trạng thái (DIN GPIO40), menuconfig "Node S3: LED debug".
#   board_audio     mic INMP441 (I2S1) + loa NS4168 (I2S0), menuconfig "Node S3: âm thanh" — MẶC ĐỊNH TẮT.
#
# Không biết services/ui/application.
idf_component_register(SRCS "src/board_display.c"
                            "src/board_sensors.c"
                            "src/board_ir.c"
                            "src/board_loads.c"
                            "src/board_led.c"
                            "src/board_audio.c"
                       INCLUDE_DIRS "include"
                       REQUIRES esp_common
                       PRIV_REQUIRES drivers)
