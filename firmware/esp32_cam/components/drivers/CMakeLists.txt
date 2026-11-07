# Tầng drivers — phần cứng của ESP32-CAM: OV2640, PIR.
# Không phụ thuộc services/application. esp32-camera khai báo trong idf_component.yml (require: public,
# vì cam_camera.h lộ kiểu camera_fb_t / framesize_t cho tầng trên).
idf_component_register(SRCS "src/cam_camera.c"
                            "src/cam_pir.c"
                       INCLUDE_DIRS "include"
                       PRIV_REQUIRES esp_driver_gpio esp_timer)
