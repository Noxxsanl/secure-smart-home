# Tầng application — luồng nghiệp vụ của Node: nối board (màn hình, SHT31) ↔ services (NVS, ESP-NOW, telemetry
# có HMAC) ↔ ui. Chỗ DUY NHẤT biết cả ba tầng (như components/application của Gateway). main chỉ gọi node_app_start().
idf_component_register(SRCS "src/node_app.c"
                       INCLUDE_DIRS "include"
                       REQUIRES esp_common
                       PRIV_REQUIRES board services ui nvs_flash esp_timer)
