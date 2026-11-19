# Tầng application — luồng nghiệp vụ của Gateway: nối drivers (màn hình, RTC) ↔ services (ESP-NOW, Local AP,
# MQTT, HTTPS) ↔ ui. Chỗ DUY NHẤT biết cả ba tầng. main chỉ gọi gw_app_start().
idf_component_register(SRCS "src/gw_app.c"
                       INCLUDE_DIRS "include"
                       REQUIRES esp_common
                       PRIV_REQUIRES drivers services ui
                                     nvs_flash esp_netif esp_event esp_timer app_update)
