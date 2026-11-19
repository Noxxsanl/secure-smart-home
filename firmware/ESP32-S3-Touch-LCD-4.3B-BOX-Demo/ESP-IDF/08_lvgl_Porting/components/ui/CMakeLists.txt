# Tầng ui — giao diện LVGL trên màn hình Gateway (IOT_NODE_NETWORK §3.3): màn hình trạng thái + xem trực tiếp camera.
# Chỉ dùng drivers (gw_display: khoá LVGL); không biết services/application — dữ liệu được đẩy vào qua gw_ui_set_*.
#   gw_ui          màn hình, mô hình dữ liệu, cầu nối sang LVGL
#   gw_live_view   đường ống hình camera: task giải nén riêng (nhân 1) chỉ lấy khung mới nhất, 2 bộ đệm RGB565 trong PSRAM
#   gw_jpeg_esp    giải nén JPEG → RGB565 bằng espressif/esp_new_jpeg (khai báo ở idf_component.yml; component manager tải 1 lần
#                  vào managed_components/, chép sang components/espressif__esp_new_jpeg/ để build offline — README, Build lần đầu)
#   gw_jpeg_tjpgd  TJpgDec trong ROM ESP32-S3 (esp_rom) — chậm hơn nhiều. CONFIG_GW_UI_JPEG_TJPGD bật: là bộ giải nén duy
#                  nhất; tắt: luôn biên dịch kèm làm đường lui lúc chạy của gw_jpeg_esp (khung esp_new_jpeg không giải được)
#   fonts/         font tiếng Việt có dấu 16/20/24 px (Montserrat + biểu tượng LVGL), sinh bằng fonts/gen_fonts.sh
set(gw_ui_srcs "src/gw_ui.c"
               "src/gw_live_view.c"
               "src/gw_jpeg_tjpgd.c"
               "fonts/gw_font_vi_16.c"
               "fonts/gw_font_vi_20.c"
               "fonts/gw_font_vi_24.c")
if(NOT CONFIG_GW_UI_JPEG_TJPGD)
    list(APPEND gw_ui_srcs "src/gw_jpeg_esp.c")
endif()

set(gw_ui_priv_requires drivers json esp_timer esp_rom heap)
if(NOT CONFIG_GW_UI_JPEG_TJPGD)
    list(APPEND gw_ui_priv_requires espressif__esp_new_jpeg)
endif()

idf_component_register(SRCS ${gw_ui_srcs}
                       INCLUDE_DIRS "include"
                       REQUIRES esp_common
                       PRIV_REQUIRES ${gw_ui_priv_requires})
