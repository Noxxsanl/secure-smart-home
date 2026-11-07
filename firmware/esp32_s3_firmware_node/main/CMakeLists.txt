# Chưa khai báo REQUIRES: khi đó ESP-IDF cho main phụ thuộc MỌI component của project, nên `idf.py build`
# vẫn biên dịch toàn bộ drivers/services dù app_main chưa gọi tới.
# Khi chốt GPIO và nối vào main: đổi thành PRIV_REQUIRES board application (xem README, mục "Khi chốt GPIO").
idf_component_register(SRCS "app_main.c"
                       INCLUDE_DIRS ".")
