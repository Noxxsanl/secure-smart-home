# Tầng application — luồng nghiệp vụ camera cửa: nối driver (PIR, camera) với services (ESP-NOW, gửi ảnh, luồng).
idf_component_register(SRCS "src/cam_app.c"
                       INCLUDE_DIRS "include"
                       PRIV_REQUIRES services drivers
                                     nvs_flash esp_netif esp_event app_update esp_app_format)
