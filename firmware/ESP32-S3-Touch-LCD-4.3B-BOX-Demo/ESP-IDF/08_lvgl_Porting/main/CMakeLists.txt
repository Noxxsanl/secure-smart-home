# main chỉ gọi tầng application (README, mục Quy tắc phụ thuộc).
idf_component_register(SRCS "main.c"
                       INCLUDE_DIRS "."
                       PRIV_REQUIRES application)
