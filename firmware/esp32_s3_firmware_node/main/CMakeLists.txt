# main chỉ khởi động màn hình (board + ui). Khi chốt GPIO, đổi thành PRIV_REQUIRES application như Gateway
# (README, mục "Khi chốt GPIO"). Mọi component trong components/ vẫn được biên dịch dù main không REQUIRES tới.
idf_component_register(SRCS "app_main.c"
                       INCLUDE_DIRS "."
                       PRIV_REQUIRES board ui)
