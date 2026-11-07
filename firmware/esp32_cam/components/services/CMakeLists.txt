# Tầng services — cấu hình NVS, đồng hồ, WiFi Local AP, ESP-NOW, gửi ảnh, luồng MJPEG.
# Dùng drivers (camera); không biết application. Header public chỉ lộ kiểu của chính services.
idf_component_register(SRCS "src/cam_config.c"
                            "src/cam_time.c"
                            "src/cam_wifi.c"
                            "src/cam_espnow.c"
                            "src/cam_snapshot.c"
                            "src/cam_stream.c"
                       INCLUDE_DIRS "include"
                       PRIV_REQUIRES drivers
                                     security_manager espnow_proto
                                     nvs_flash esp_wifi esp_netif esp_event esp_timer
                                     esp_http_client esp_http_server esp_app_format json)
