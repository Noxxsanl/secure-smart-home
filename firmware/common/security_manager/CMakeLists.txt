idf_component_register(SRCS "security_manager.c" "sm_counter.c"
                       INCLUDE_DIRS "include"
                       REQUIRES esp_common
                       PRIV_REQUIRES mbedtls nvs_flash)
