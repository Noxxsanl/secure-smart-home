# Tầng ui — giao diện LVGL trên màn hình Gateway (IOT_NODE_NETWORK §3.3). Bản sơ bộ: 1 màn hình trạng thái.
# Chỉ dùng drivers (gw_display: khoá LVGL); không biết services/application — dữ liệu được đẩy vào qua gw_ui_set_*.
idf_component_register(SRCS "src/gw_ui.c"
                       INCLUDE_DIRS "include"
                       REQUIRES esp_common
                       PRIV_REQUIRES drivers json)
