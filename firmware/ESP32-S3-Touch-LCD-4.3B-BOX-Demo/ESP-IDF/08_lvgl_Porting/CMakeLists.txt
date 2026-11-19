# Gateway Smart Home — Waveshare ESP32-S3-Touch-LCD-4.3B-BOX (ESP32-S3-N16R8).
# Thiết kế: docs/firmware/IOT_NODE_NETWORK.md §3, §5, §6. Cấu trúc, quy tắc phụ thuộc, build: README.md.
# Xuất phát từ ví dụ 08_lvgl_Porting của Waveshare (driver LCD/LVGL giữ nguyên trong components/drivers/src/lcd).
cmake_minimum_required(VERSION 3.16)

# Mã dùng chung với Node/Camera (HMAC, khung ESP-NOW) — đặt TRƯỚC include(project.cmake).
set(EXTRA_COMPONENT_DIRS "${CMAKE_CURRENT_LIST_DIR}/../../../common")

include($ENV{IDF_PATH}/tools/cmake/project.cmake)
add_compile_options("-Wno-attributes")   # như ví dụ Waveshare (LVGL 8 + GCC 13)
project(gateway_s3)

# -Os cho toàn bộ app + bảng dung lượng sau mỗi lần link (docs/guides/ESP_IDF_BUILD.md §5)
include(${CMAKE_CURRENT_LIST_DIR}/../../../cmake/fw_build.cmake)
fw_optimize_size()
fw_size_report()
