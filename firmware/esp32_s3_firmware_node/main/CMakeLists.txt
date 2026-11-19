# main chỉ gọi node_app_start() (components/application), như Gateway.
idf_component_register(SRCS "app_main.c"
                       INCLUDE_DIRS "."
                       PRIV_REQUIRES application)
