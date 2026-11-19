# Chứng chỉ: Broker MQTT (mTLS), nginx HTTPS, client MQTT

Mọi file sinh ra nằm trong `infra/mosquitto/certs/` (gitignore, trừ `.gitkeep`). Chứng chỉ client của gateway nằm trong
`firmware/ESP32-S3-Touch-LCD-4.3B-BOX-Demo/ESP-IDF/08_lvgl_Porting/certs/` (gitignore).

```bash
bash infra/pki/gen_mqtt_certs.sh <IP LAN máy chạy broker>      # CA, broker, nginx, client backend, CRL
bash infra/pki/gen_mqtt_client.sh <gateway_id>                 # chứng chỉ client cho 1 gateway (mTLS)
bash infra/pki/gen_mqtt_client.sh --revoke <gateway_id>        # thu hồi → docker compose restart mqtt-broker
CA_KEY_PASS='...' bash infra/pki/gen_mqtt_certs.sh <IP LAN>    # (tuỳ chọn) ca.key mã hoá AES-256 khi tạo CA mới
```

| File | Nội dung | Ai dùng |
|---|---|---|
| `ca.crt` | CA nội bộ (công khai) | Broker, nginx (gián tiếp), backend (`MQTT_CA_FILE`), gateway (chép thành `certs/mqtt_ca.crt`, nhúng lúc build), trình duyệt/điện thoại (cài làm CA tin cậy để mở `https://` không cảnh báo), app Mobile (`API_CA_PEM_BASE64`) |
| `ca.key` | Khoá riêng CA — ai có file này cấp được cert giả | Chỉ script. Không mount vào container. Nên đặt `CA_KEY_PASS` và cất ngoài máy chạy dịch vụ ở production |
| `ca.crl` | Danh sách chứng chỉ client bị thu hồi (hạn 10 năm) | Broker (`crlfile`) |
| `ca-db/`, `ca.cnf`, `issued/` | Sổ cái của CA (`openssl ca`), bản sao chứng chỉ client đã cấp | Script thu hồi |
| `server.crt` / `.key` | Broker MQTT :8883 — SAN `localhost`, `127.0.0.1`, `mqtt-broker`, IP/hostname truyền vào | Broker |
| `web.crt` / `.key` | nginx :443 — SAN `localhost`, `admin/operator/user.localhost`, IP truyền vào | nginx (web, app Mobile, gateway gửi ảnh / `/api/device/data`) |
| `clients/iot-backend-{data,commands,heartbeat,camera}.{crt,key}` | Chứng chỉ client ECDSA của 4 kết nối MQTT backend (CN = tên = username trên broker) | Backend (`MQTT_CLIENT_CERT_DIR`) |

- Broker bắt buộc chứng chỉ client (`require_certificate`), lấy CN làm username và client id; quyền topic theo `infra/mosquitto/acl`.
- Đổi IP LAN: chạy lại `gen_mqtt_certs.sh` với IP mới. CA dùng lại → **không** phải nạp lại firmware gateway; chứng chỉ client giữ nguyên.
- Thay CA: xoá `ca.*`, `ca-db/`, `clients/`, `issued/` rồi chạy lại; sau đó cấp lại chứng chỉ gateway, build + nạp lại gateway (CA mới + NVS mới).
- Thu hồi gateway: `--revoke` cập nhật `ca.crl`; gateway đó không bắt tay TLS được nữa sau khi khởi động lại broker. Nên khoá thiết bị trên Dashboard cùng lúc.
- Kiểm tra: `bash tests/security/check_mqtt_tls.sh <IP>` (TLS/mTLS), `bash tests/security/check_mqtt_acl.sh <gateway_id>` (ACL, chiếm client id).
