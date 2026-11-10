# Chứng chỉ TLS cho MQTT Broker 2

`infra/pki/gen_mqtt_certs.sh` sinh chứng chỉ vào `infra/mosquitto/certs/`. Mọi file trong thư mục đó (trừ `.gitkeep`) đều bị gitignore.

```bash
bash infra/pki/gen_mqtt_certs.sh <IP LAN máy chạy broker>
```

| File | Nội dung | Ai dùng |
|---|---|---|
| `ca.crt` | Chứng chỉ CA nội bộ (công khai) | Broker 2, backend (`MQTT_CA_FILE`), gateway (script chép vào `firmware/ESP32-S3-Touch-LCD-4.3B-BOX-Demo/ESP-IDF/08_lvgl_Porting/certs/mqtt_ca.crt`, nhúng lúc build), `mosquitto_sub --cafile` |
| `ca.key` | Khoá riêng CA — ai có file này cấp được cert giả cho broker | Chỉ script. Không mount vào container, không copy đi đâu |
| `server.crt` | Chứng chỉ Broker 2, SAN gồm `localhost`, `127.0.0.1`, `mqtt-broker-2` và IP/hostname truyền vào script | Broker 2 (:8883), nginx HTTPS (:443 — gateway gửi ảnh camera) |
| `server.key` | Khoá riêng của server | Broker 2, nginx |

- Đổi IP LAN: chạy lại script với IP mới. CA được dùng lại nên **không** phải nạp lại firmware gateway.
- Thay CA: xoá `ca.crt` và `ca.key` rồi chạy lại script. Sau đó phải build và nạp lại firmware gateway.
- Hiện đang là TLS xác thực server (FR-12.3). mTLS cho gateway và tắt `allow_anonymous` (FR-12.4) là bước tiếp theo.
