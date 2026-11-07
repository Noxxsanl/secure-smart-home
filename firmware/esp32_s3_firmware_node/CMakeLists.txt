# Node phòng khách — ESP32-S3. Thiết kế: docs/firmware/IOT_NODE_NETWORK.md §4.1, §4.3, §5.1, §6.1, §6.3.
cmake_minimum_required(VERSION 3.16)

# Mã dùng chung với Gateway/Camera (HMAC, khung ESP-NOW) — đặt TRƯỚC include(project.cmake).
set(EXTRA_COMPONENT_DIRS "${CMAKE_CURRENT_LIST_DIR}/../common")

include($ENV{IDF_PATH}/tools/cmake/project.cmake)
project(esp32_s3_firmware_node)
