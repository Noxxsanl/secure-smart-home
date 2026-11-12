# Tầng application — luồng nghiệp vụ của Node: nối board (màn hình, SHT31) ↔ services (NVS, ESP-NOW, telemetry
# có HMAC) ↔ ui. Chỗ DUY NHẤT biết cả ba tầng (như components/application của Gateway). main chỉ gọi node_app_start().
#   node_app  luồng chính: NVS → màn hình → ESP-NOW; task climate (SHT31 → màn hình, TELEMETRY → Gateway)
#   node_ac   điều hòa qua hồng ngoại: học mã remote (board_ir → node_ir_store), phát mã theo màn hình / lệnh Gateway
idf_component_register(SRCS "src/node_app.c"
                            "src/node_ac.c"
                       INCLUDE_DIRS "include"
                       REQUIRES esp_common
                       PRIV_REQUIRES board services ui nvs_flash esp_timer)
