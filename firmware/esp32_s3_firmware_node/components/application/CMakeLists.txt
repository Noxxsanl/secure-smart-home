# Tầng application — luồng nghiệp vụ của Node: nối board (màn hình, SHT31) ↔ services (NVS, ESP-NOW, telemetry
# có HMAC) ↔ ui. Chỗ DUY NHẤT biết cả ba tầng (như components/application của Gateway). main chỉ gọi node_app_start().
#   node_app         luồng chính: LED → NVS → màn hình → ESP-NOW → tải; task climate (SHT31 → màn hình), task report
#                    (TELEMETRY số đo + trạng thái tải → Gateway, LED trạng thái), chuyển lệnh Gateway theo params.target
#   node_ac          điều hòa qua hồng ngoại: học mã remote (board_ir → node_ir_store), phát mã theo màn hình / lệnh
#   node_switches    đèn, quạt qua relay (board_loads), khôi phục trạng thái sau mất điện (node_state_store)
#   node_curtain     rèm qua động cơ bước (board_loads): vị trí + hành trình hiệu chuẩn lưu NVS, bảng Rèm trên màn hình
#   node_status_led  LED WS2812 báo trạng thái (board_led)
#   node_audio       mic + loa (board_audio) — mặc định TẮT, viết sẵn cho tính năng giọng nói
idf_component_register(SRCS "src/node_app.c"
                            "src/node_ac.c"
                            "src/node_switches.c"
                            "src/node_curtain.c"
                            "src/node_status_led.c"
                            "src/node_audio.c"
                       INCLUDE_DIRS "include"
                       REQUIRES esp_common
                       PRIV_REQUIRES board services ui nvs_flash esp_timer)
