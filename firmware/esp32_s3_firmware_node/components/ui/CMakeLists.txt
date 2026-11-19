# Tầng ui — giao diện LVGL trên màn hình Node, như components/ui của Gateway.
# Chỉ dùng drivers (drv_display: khoá LVGL); không biết board/services/application — dữ liệu được đẩy vào qua node_ui_*.
#   node_ui   màn hình (hiện là màn hình kiểm tra cảm ứng khi lắp mạch)
#   fonts/    font tiếng Việt có dấu 16/24 px (Montserrat + biểu tượng LVGL), sinh bằng fonts/gen_fonts.sh
idf_component_register(SRCS "src/node_ui.c"
                            "fonts/node_font_vi_16.c"
                            "fonts/node_font_vi_24.c"
                       INCLUDE_DIRS "include"
                       REQUIRES esp_common
                       PRIV_REQUIRES drivers)
