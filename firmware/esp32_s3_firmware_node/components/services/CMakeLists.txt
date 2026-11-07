# Tầng services — không chạm phần cứng (trừ radio WiFi cho ESP-NOW):
#   node_config     identity + ghép nối đọc từ NVS
#   node_time       đồng hồ lấy từ Gateway (TIME_SYNC), node không có NTP
#   node_link       ESP-NOW tới Gateway: dò kênh, peer mã hoá, heartbeat, lệnh + ack, chống trùng
#   node_telemetry  dựng sensor_payload có HMAC lớp 1 (khớp backend)
#   node_ir_store   lưu mã IR đã học vào NVS
#
# Không biết drivers/application. json (cJSON) public vì callback lệnh trả `params` dạng cJSON.
idf_component_register(SRCS "src/node_config.c"
                            "src/node_time.c"
                            "src/node_link.c"
                            "src/node_telemetry.c"
                            "src/node_ir_store.c"
                       INCLUDE_DIRS "include"
                       REQUIRES json esp_common
                       PRIV_REQUIRES security_manager espnow_proto
                                     mbedtls nvs_flash esp_wifi esp_netif esp_event esp_timer esp_app_format)
