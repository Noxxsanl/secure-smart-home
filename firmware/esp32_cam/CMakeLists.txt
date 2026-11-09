# ESP32-CAM (AI-Thinker) — camera cửa. Thiết kế: docs/firmware/IOT_NODE_NETWORK.md §4.2, §5.2, §5.4.
cmake_minimum_required(VERSION 3.16)

# Mã dùng chung với Gateway/Node (HMAC, khung ESP-NOW) — đặt TRƯỚC include(project.cmake).
set(EXTRA_COMPONENT_DIRS "${CMAKE_CURRENT_LIST_DIR}/../common")

include($ENV{IDF_PATH}/tools/cmake/project.cmake)
project(esp32_cam)

# -Os cho toàn bộ app + bảng dung lượng sau mỗi lần link (docs/guides/ESP_IDF_BUILD.md §5)
include(${CMAKE_CURRENT_LIST_DIR}/../cmake/fw_build.cmake)
fw_optimize_size()
fw_size_report()
