# Tầng board — chỗ DUY NHẤT biết chân GPIO của Node (README, mục Màn hình / Khi chốt GPIO).
#   board_display   bus SPI2 → TFT ILI9488 → LVGL 8.4 → cảm ứng XPT2046. Chân, hướng, hiệu chuẩn lấy từ
#                   Kconfig.projbuild (menuconfig "Node S3: màn hình"), tương đương gw_display của Gateway.
# Cảm biến, relay, IR, âm thanh: thêm vào đây khi chốt sơ đồ chân.
#
# Không biết services/ui/application.
idf_component_register(SRCS "src/board_display.c"
                       INCLUDE_DIRS "include"
                       REQUIRES esp_common
                       PRIV_REQUIRES drivers)
