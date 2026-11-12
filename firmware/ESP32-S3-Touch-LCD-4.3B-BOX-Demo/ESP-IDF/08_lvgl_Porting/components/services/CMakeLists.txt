# Tầng services — mạng, bảo mật, giao thức; không chạm phần cứng (trừ radio WiFi):
#   gw_config       identity + WiFi + Local AP + cloud từ NVS; secret gateway chỉ nằm ở đây (sign/verify)
#   gw_registry     node/camera đã ghép: device_id, secret, MAC, LMK (NVS "nodes"); trạng thái online/RSSI
#   gw_time         giờ từ RTC lúc khởi động, SNTP khi có mạng (hàm RTC do application truyền vào)
#   gw_wifi         AP+STA: router của nhà + Local AP cho camera
#   gw_espnow       ESP-NOW với node/camera: lọc MAC, chống trùng seq, kiểm HMAC lớp 1, TIME_SYNC, CMD
#   gw_local_http   POST /local/camera/snapshot trên Local AP, kiểm HMAC camera
#   gw_camera_live  kéo luồng MJPEG GET /stream của camera (ký HMAC camera), tách từng khung JPEG
#   gw_tls          CA nhúng; chặn kết nối không TLS trừ khi bật [DEV]
#   gw_envelope     payload Gateway → Server có HMAC gateway (telemetry, ack, heartbeat, camera event)
#   gw_mqtt         Broker MQTT TLS: publish telemetry/ack/…, nhận + kiểm lệnh từ Server
#   gw_api          HTTPS Backend: /api/device/data (dự phòng), /api/device/camera/snapshot (đề xuất)
#
# Không biết drivers/ui/application.

# CA của Broker MQTT / Backend (infra/pki/gen_mqtt_certs.sh): chép infra/mosquitto/certs/ca.crt thành
# certs/mqtt_ca.crt ở gốc project (gitignore — docs/guides/ESP_IDF_BUILD.md §7.2). Chưa có thì nhúng file rỗng:
# vẫn build được, nhưng gw_tls từ chối mqtts:// và https:// lúc chạy.
set(gw_ca_file "")
if(NOT CMAKE_BUILD_EARLY_EXPANSION)
    idf_build_get_property(project_dir PROJECT_DIR)
    set(gw_ca_file "${project_dir}/certs/mqtt_ca.crt")
    if(NOT EXISTS "${gw_ca_file}")
        # Cùng tên file → cùng ký hiệu _binary_mqtt_ca_crt_start
        set(gw_ca_file "${CMAKE_CURRENT_BINARY_DIR}/ca_placeholder/mqtt_ca.crt")
        if(NOT EXISTS "${gw_ca_file}")
            file(WRITE "${gw_ca_file}" "")
        endif()
        message(WARNING "certs/mqtt_ca.crt not found — MQTT TLS/HTTPS disabled at runtime (README: Build lần đầu)")
    endif()
endif()

idf_component_register(SRCS "src/gw_config.c"
                            "src/gw_registry.c"
                            "src/gw_time.c"
                            "src/gw_wifi.c"
                            "src/gw_espnow.c"
                            "src/gw_local_http.c"
                            "src/gw_camera_live.c"
                            "src/gw_tls.c"
                            "src/gw_envelope.c"
                            "src/gw_mqtt.c"
                            "src/gw_api.c"
                       INCLUDE_DIRS "include"
                       REQUIRES esp_common esp_netif security_manager
                       PRIV_REQUIRES espnow_proto json mbedtls nvs_flash bootloader_support esp_wifi esp_event
                                     esp_timer esp_http_server esp_http_client mqtt esp_app_format lwip
                       EMBED_TXTFILES "${gw_ca_file}")
