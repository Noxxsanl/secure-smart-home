# Hoàn thiện bảo mật thiết bị khi đưa ra production

> **Trạng thái: hướng phát triển — CHƯA hiện thực.** Tài liệu mô tả việc cần làm để đưa Gateway, Node và Camera từ bản
> demo lên bản thương mại. Không có cấu hình nào ở đây được bật trong code hiện tại, và **không áp dụng lên board demo**:
> các bước đốt eFuse là **không đảo ngược**. Hiện trạng bảo mật đã có: [SECURITY_ARCHITECTURE](../SECURITY_ARCHITECTURE.md),
> [MQTT_TLS](../guides/MQTT_TLS.md); kiến trúc nhúng: [EMBEDDED_ARCHITECTURE_ESP_IDF](EMBEDDED_ARCHITECTURE_ESP_IDF.md).
>
> Tên tuỳ chọn Kconfig và cú pháp lệnh trong tài liệu theo ESP-IDF 5.4; khi hiện thực phải đối chiếu lại với
> `idf.py menuconfig` và tài liệu Espressif *Security Features Enablement Workflows* của đúng phiên bản IDF đang dùng.

## 1. Bối cảnh: đã bảo vệ gì, còn hở gì

**Đã có (chống tấn công qua mạng):**

| Lớp | Cơ chế |
|---|---|
| Node → Gateway | ESP-NOW mã hoá CCMP bằng LMK riêng từng Node |
| Gateway → Broker | MQTT TLS 8883, **mTLS bắt buộc** (CN = gateway_id), ACL theo CN, thu hồi bằng CRL |
| Gateway → Server (HTTP/WS) | HTTPS/WSS, kiểm chứng CA nhúng |
| Dữ liệu | Chữ ký v2 phủ nội dung + bộ đếm chống phát lại cho telemetry, heartbeat; ack/sự kiện camera ký v2 (chưa có bộ đếm); Camera ↔ Gateway ký `v2\|cam-up`/`v2\|cam-stream` có bộ đếm; Gateway không giữ secret Node |
| Server | Secret thiết bị trong DB mã hoá AES-256-GCM (`DEVICE_SECRET_KEY`) |
| Vận hành | Xoay vòng secret/LMK (`npm run hw:rotate`), thu hồi chứng chỉ (`gen_mqtt_client.sh --revoke`) |

**Còn hở (tấn công vật lý):** chip ESP32/ESP32-S3 chạy chương trình và đọc NVS từ **chip flash SPI rời, lưu dạng rõ**.
Ai cầm được board có thể:

1. Cắm USB → `esptool.py read_flash` → đọc toàn bộ NVS trong vài phút; hoặc tháo chip flash đọc bằng máy nạp.
2. Nạp firmware của chính họ (không cần chữ ký) để đọc khoá lúc chạy hoặc biến thiết bị thành cửa hậu.

Tài sản nằm trong NVS từng board (theo `nvs_dev.csv.example`):

| Board | Giá trị nhạy cảm | Lộ thì kẻ tấn công làm được |
|---|---|---|
| Gateway (ESP32-S3) | `cloud/mqtt_key` (khoá riêng chứng chỉ client) | Kết nối broker dưới danh nghĩa Gateway |
| | `identity/device_secret` | Ký telemetry lớp gateway, heartbeat, ack, ảnh camera |
| | `nodes/<i>_lmk` | Giải mã / giả khung ESP-NOW trong nhà |
| | `nodes/<i>_secret` (của camera) | Gửi ảnh / mở luồng xem như camera |
| | `wifi/password`, `local_ap/password` | Vào mạng Wi-Fi nhà và Local AP |
| Node (ESP32-S3) | `identity/device_secret`, `pairing/session_key` | Giả số đo của chính Node đó |
| Camera (ESP32) | `identity/device_secret`, `pairing/session_key`, `wifi/password` | Giả ảnh của camera, vào Local AP |

Phạm vi thiệt hại hiện **giới hạn trong một nhà** (mỗi thiết bị có secret, chứng chỉ, LMK riêng; Gateway không còn giữ secret
Node) và khắc phục được bằng thu hồi + xoay vòng. Production cần chặn ngay từ đầu: **đọc flash không ra khoá, và chip chỉ
chạy firmware của nhà sản xuất**.

## 2. Mục tiêu và tiêu chí nghiệm thu

| ID | Tiêu chí | Cách kiểm |
|---|---|---|
| PH-1 | Đọc flash không lộ secret, khoá riêng, mật khẩu Wi-Fi | `read_flash` phân vùng `nvs` → `strings` không thấy `BEGIN`, `device_uuid`, SSID |
| PH-2 | Chip từ chối firmware không có chữ ký hợp lệ | Nạp bản build ký bằng khoá khác → bootloader báo lỗi xác minh, không chạy |
| PH-3 | Không nạp/đọc qua UART hay JTAG ở trạng thái bàn giao | `espefuse.py summary`: JTAG tắt, download mode tắt hoặc chế độ an toàn |
| PH-4 | Không hạ cấp về firmware cũ có lỗi | OTA bản có `secure_version` thấp hơn bị từ chối |
| PH-5 | Không còn tuỳ chọn DEV trong bản production | Build production báo lỗi nếu bật `*_ALLOW_UNENCRYPTED`, `GW_DEV_ALLOW_PLAINTEXT` |
| PH-6 | Khoá riêng chứng chỉ không bao giờ ra khỏi thiết bị | Chứng chỉ cấp qua CSR sinh trên chip (mục 6) |

## 3. Các cơ chế trên chip

| Cơ chế | Tác dụng | ESP32-S3 (Gateway, Node) | ESP32 (Camera) |
|---|---|---|---|
| **Flash Encryption** | Mã hoá phần mềm, bảng phân vùng và phân vùng đánh dấu `encrypted`; khoá trong eFuse, phần mềm không đọc được | XTS-AES-128/256 | AES-256 |
| **Mã hoá NVS** | NVS mã hoá XTS-AES riêng (Flash Encryption không tự mã hoá NVS) | 2 cách: khoá bảo vệ bằng **HMAC trong eFuse**, hoặc phân vùng `nvs_keys` được Flash Encryption bảo vệ | Chỉ cách `nvs_keys` (ESP32 không có bộ HMAC) → bắt buộc kèm Flash Encryption |
| **Secure Boot v2** | ROM chỉ chạy bootloader, bootloader chỉ chạy app có chữ ký RSA-3072 (RSA-PSS) khớp digest khoá công khai trong eFuse; tối đa 3 khoá, thu hồi được từng khoá | Có | Chỉ chip **rev ≥ 3.0** (ECO3); rev thấp hơn chỉ có Secure Boot v1 (khoá đối xứng, yếu hơn) |
| **Digital Signature (DS)** | Khoá riêng RSA được mã hoá bằng khoá HMAC trong eFuse; chip ký TLS bằng phần cứng, **phần mềm không bao giờ thấy khoá riêng** | Có (RSA) | Không |
| **Tắt JTAG / download mode** | Chặn gỡ lỗi và đọc/nạp qua UART | eFuse `DIS_USB_JTAG`, `DIS_PAD_JTAG`, `DIS_DOWNLOAD_MODE` hoặc *Secure Download Mode* | Tương tự |
| **Chống hạ cấp** | App có `secure_version` thấp hơn giá trị trong eFuse bị từ chối | `CONFIG_BOOTLOADER_APP_ANTI_ROLLBACK` | Có |

Thứ tự phụ thuộc: Secure Boot không có Flash Encryption thì vẫn đọc được khoá; Flash Encryption không có Secure Boot thì kẻ
tấn công nạp firmware "dumper" để chip tự giải mã giúp. **Phải bật cả hai** (và mã hoá NVS) mới đạt PH-1 + PH-2.

## 4. Cấu hình đề xuất

### 4.1 Hồ sơ build production

Thêm file `sdkconfig.defaults.production` cho từng project, build bằng:

```bash
idf.py -D SDKCONFIG_DEFAULTS="sdkconfig.defaults;sdkconfig.defaults.production" \
       -D SDKCONFIG=sdkconfig.production -B build_production build
```

Nội dung dự kiến (Gateway, Node — ESP32-S3):

```ini
# Secure Boot v2 (RSA-3072), ký app + bootloader ngay khi build
CONFIG_SECURE_BOOT=y
CONFIG_SECURE_BOOT_V2_ENABLED=y
CONFIG_SECURE_BOOT_BUILD_SIGNED_BINARIES=y
CONFIG_SECURE_BOOT_SIGNING_KEY="../keys/secure_boot_signing_key.pem"   # NGOÀI repo, xem mục 7

# Flash Encryption chế độ Release (khoá sinh trên chip, không ai biết)
CONFIG_SECURE_FLASH_ENC_ENABLED=y
CONFIG_SECURE_FLASH_ENCRYPTION_MODE_RELEASE=y

# Mã hoá NVS, khoá bảo vệ bằng HMAC trong eFuse
CONFIG_NVS_ENCRYPTION=y
CONFIG_NVS_SEC_KEY_PROTECT_USING_HMAC=y

# Chống hạ cấp
CONFIG_BOOTLOADER_APP_ANTI_ROLLBACK=y
CONFIG_BOOTLOADER_APP_SECURE_VERSION=1

# UART chỉ còn Secure Download Mode (không đọc flash / không ghi dạng rõ)
CONFIG_SECURE_UART_ROM_DL_MODE=y

# Tắt mọi tuỳ chọn DEV của dự án
# CONFIG_GW_DEV_ALLOW_PLAINTEXT is not set
# CONFIG_GW_ESPNOW_ALLOW_UNENCRYPTED is not set
# CONFIG_NODE_ESPNOW_ALLOW_UNENCRYPTED is not set

# Log tối thiểu
CONFIG_LOG_DEFAULT_LEVEL_WARN=y
```

Camera (ESP32): giống trên nhưng mã hoá NVS dùng cách `nvs_keys` (không có `NVS_SEC_KEY_PROTECT_USING_HMAC`); Secure Boot v2
chỉ khi chip rev ≥ 3.0 (mục 5), và tắt `CONFIG_CAM_ESPNOW_ALLOW_UNENCRYPTED`.

Thêm kiểm tra lúc build (PH-5): `#if defined(CONFIG_SECURE_FLASH_ENC_ENABLED) && defined(CONFIG_GW_DEV_ALLOW_PLAINTEXT)` →
`#error`, tương tự cho các tuỳ chọn `*_ALLOW_UNENCRYPTED`.

### 4.2 Bảng phân vùng

Hiện tại `nvs` nằm ở 0x9000 ngay sau bảng phân vùng 0x8000. Khi bật Secure Boot + Flash Encryption:

- Bootloader lớn hơn → có thể phải dời `CONFIG_PARTITION_TABLE_OFFSET` (ví dụ `0xC000` hoặc `0x10000`); `idf.py build` báo
  lỗi nếu bootloader chồng lên bảng phân vùng.
- Camera (cách `nvs_keys`) thêm phân vùng 4 KB có cờ `encrypted`:
  `nvs_keys, data, nvs_keys, , 4K, encrypted` — flash 4 MB hiện còn trống khoảng 128 KB nên đủ chỗ.
- Phân vùng dữ liệu riêng (`log` kiểu 0x40, `storage` của Gateway) **không** tự được mã hoá: nếu có thể chứa dữ liệu nhạy
  cảm thì thêm cờ `encrypted`.
- Phân vùng `ota_0`/`ota_1` giữ nguyên (đã đủ cho OTA có chữ ký).

### 4.3 Khoá riêng chứng chỉ MQTT của Gateway

| Phương án | Mô tả | Đánh giá |
|---|---|---|
| A. Giữ ECDSA P-256 trong NVS mã hoá | Như hiện tại, chỉ thêm mã hoá NVS | Đơn giản; khoá vẫn xuất hiện trong RAM lúc bắt tay TLS |
| **B. Chuyển sang DS peripheral** (đề xuất) | Chứng chỉ Gateway dùng RSA-3072; khoá riêng được mã hoá bằng khoá HMAC trong eFuse, esp-mqtt cấu hình `ds_data` thay `client_key` | Phần mềm (kể cả firmware bị chiếm) không đọc được khoá; `infra/pki/gen_mqtt_client.sh` thêm tuỳ chọn RSA, broker không cần đổi |

Node và Camera không dùng chứng chỉ, chỉ cần mã hoá NVS.

## 5. Lưu ý riêng cho ESP32-CAM

1. **Kiểm revision chip trước:** `esptool.py --chip esp32 -p COMx chip_id` → dòng `Chip is ESP32-D0WD... (revision vX.Y)`.
   - `v3.0` trở lên: dùng Secure Boot v2 (RSA-3072) + Flash Encryption + NVS `nvs_keys` như Gateway.
   - Thấp hơn: chỉ có Secure Boot v1 (khoá đối xứng trong eFuse). Production nên **chọn module ESP32 rev 3 hoặc chuyển sang
     ESP32-S3** có camera (ví dụ dòng ESP32-S3-EYE) — ghi rõ là giới hạn phần cứng nếu giữ module hiện tại.
2. PSRAM và driver camera hoạt động bình thường khi bật Flash Encryption; tốc độ đọc flash giảm không đáng kể vì giải mã
   bằng phần cứng.
3. Luồng ảnh Camera → Gateway hiện dựa vào WPA2 của Local AP + HMAC theo khoá camera; mã hoá flash giúp khoá camera và mật
   khẩu Local AP không bị lấy từ board camera bị tháo.

## 6. Quy trình cấp phát tại xưởng

Thay cho `nvs_dev.csv` viết tay và `npm run hw:register` đọc CSV (công cụ DEV):

```
1. Nạp firmware production đã ký → lần khởi động đầu chip tự sinh khoá Flash Encryption, đốt eFuse,
   mã hoá phần mềm tại chỗ, bật Secure Boot.
2. Đốt khoá HMAC cho mã hoá NVS (và khoá DS nếu dùng phương án 4.3-B) — mỗi chip một khoá ngẫu nhiên,
   không lưu lại ở đâu.
3. Thiết bị tự sinh cặp khoá TLS (hoặc khoá DS) và gửi CSR qua cổng cấp phát; CA ký và trả chứng chỉ
   (khoá riêng không rời chip — PH-6).
4. Máy cấp phát sinh device_secret + LMK ngẫu nhiên (như hw:rotate), ghi vào ảnh NVS ĐÃ MÃ HOÁ
   (nvs_partition_gen.py chế độ encrypt) và đăng ký vào backend qua API nội bộ có xác thực.
5. Xoá mọi bản rõ trên máy cấp phát; in mã kích hoạt (QR) cho khách.
6. Khoá UART/JTAG (Secure Download Mode, tắt JTAG) → kiểm PH-1…PH-3 → đóng hộp.
```

## 7. Quản lý khoá của nhà sản xuất

| Khoá | Dùng để | Bảo quản |
|---|---|---|
| Khoá ký Secure Boot (RSA-3072) | Ký mọi bản firmware và OTA | **Ngoài repo**, máy ký offline hoặc HSM; ít nhất 2 bản sao lưu ở 2 nơi; tách khoá dev/prod. **Mất khoá = không cập nhật được thiết bị đã bán** |
| CA gốc MQTT/HTTPS | Ký CA trung gian | Offline; chỉ dùng CA trung gian để ký chứng chỉ thiết bị/broker hằng ngày |
| `DEVICE_SECRET_KEY` (backend) | Mã hoá secret thiết bị trong DB | Secret manager / KMS; có quy trình đổi khoá (giải mã bằng khoá cũ, mã hoá lại bằng khoá mới) |
| Khoá ký OTA (nếu tách khỏi Secure Boot) | Ký gói OTA | Như khoá Secure Boot |

## 8. Thử trên board dự phòng (chuẩn bị cho buổi bảo vệ)

Dùng **một board ESP32-S3 dự phòng**, không dùng Gateway/Node demo. Nên thử chế độ **Development** trước (vẫn nạp lại được
một số lần), sau đó mới Release.

```bash
# 0. Trạng thái eFuse ban đầu
espefuse.py --chip esp32s3 -p COMx summary

# 1. TRƯỚC khi bật: chứng minh flash đọc được dạng rõ
esptool.py --chip esp32s3 -p COMx read_flash 0x9000 0x6000 nvs_before.bin
strings nvs_before.bin | grep -E "device_uuid|BEGIN"      # thấy dữ liệu

# 2. Sinh khoá ký (lưu ngoài repo)
espsecure.py generate_signing_key --version 2 --scheme rsa3072 secure_boot_signing_key.pem

# 3. Build hồ sơ production, nạp bootloader + app theo hướng dẫn idf.py in ra sau khi build
#    (Secure Boot v2: bootloader nạp riêng lần đầu), rồi cho board khởi động để tự mã hoá

# 4. SAU khi bật: cùng lệnh đọc chỉ ra dữ liệu ngẫu nhiên
esptool.py --chip esp32s3 -p COMx read_flash 0x9000 0x6000 nvs_after.bin   # Release mode: lệnh bị từ chối
strings nvs_after.bin | grep -E "device_uuid|BEGIN"       # không thấy gì

# 5. Firmware ký bằng khoá khác bị bootloader từ chối (PH-2)
espefuse.py --chip esp32s3 -p COMx summary                 # SECURE_BOOT_EN, SPI_BOOT_CRYPT_CNT, JTAG đã tắt
```

Bằng chứng nộp kèm luận văn: ảnh chụp/ log của bước 1, 4, 5 và `espefuse summary` trước/sau.

## 9. Hạng mục production khác (ngoài phạm vi chip)

| Hạng mục | Hiện trạng | Việc cần làm |
|---|---|---|
| Gia hạn chứng chỉ | Hạn 825 ngày, cấp tay | Thiết bị tự gia hạn trước hạn 30 ngày (CSR mới qua kênh đã xác thực); cảnh báo trên Dashboard |
| Phân phối CRL | `ca.crl` nạp khi broker khởi động | Quy trình thu hồi tự động: cập nhật CRL + khởi động lại/nạp lại broker, ngắt phiên đang mở |
| OTA | Có tab OTA, chưa có trên thiết bị | OTA qua HTTPS, ảnh ký Secure Boot, `secure_version` chống hạ cấp, tự quay về bản cũ khi khởi động lỗi |
| Phát hiện nhân bản | Đã có phát hiện **nghi vấn** ở backend từ heartbeat đúng chữ ký (uptime lùi, IP đổi qua lại, `ctr` phát lại) → audit `GATEWAY_DUPLICATE_SUSPECTED` + thông báo nhân viên, không tự khoá (`devices/domain/gateway-clone-detector.ts`, trạng thái chỉ trong RAM). Chưa có phát hiện ở broker | Phát hiện chắc chắn: cảnh báo khi một chứng chỉ/`gateway_id` kết nối từ 2 nơi cùng lúc (broker/CRL tự động), kèm quy trình cấp lại + thu hồi |
| Ghép nối ESP-NOW | LMK nạp qua NVS | Ghép nối ECDH tại chỗ (khung `PAIR_*` đã dành sẵn) thay cho LMK cấp sẵn |
| Kiểm định | Kịch bản `tests/security/` | Pentest độc lập; đối chiếu tiêu chuẩn ETSI EN 303 645 |

Đối chiếu ETSI EN 303 645 (tiêu chuẩn an ninh mạng cho thiết bị IoT tiêu dùng):

| Điều khoản | Nội dung | Đáp ứng bằng |
|---|---|---|
| 5.1 | Không mật khẩu mặc định dùng chung | Secret/LMK/chứng chỉ riêng từng thiết bị (đã có) |
| 5.3 | Cập nhật phần mềm an toàn | OTA ký + chống hạ cấp (mục 9) |
| 5.4 | Lưu trữ an toàn tham số bảo mật | Flash Encryption, mã hoá NVS, DS (mục 3–4) |
| 5.5 | Giao tiếp an toàn | mTLS, HTTPS, chữ ký v2, ESP-NOW CCMP (đã có) |
| 5.6 | Giảm bề mặt tấn công | Tắt JTAG/download mode, gỡ tuỳ chọn DEV (mục 4.1) |
| 5.7 | Đảm bảo toàn vẹn phần mềm | Secure Boot v2 (mục 3) |

## 10. Rủi ro và lưu ý

- **eFuse không đảo ngược.** Sai cấu hình có thể làm board không nạp lại được hoặc không khởi động; luôn thử trên board dự
  phòng, đọc kỹ `espefuse summary` trước mỗi lần đốt.
- **Release mode:** không nạp lại qua UART được nữa (chỉ OTA). Development mode cho nạp lại nhưng giới hạn số lần bật/tắt
  (bộ đếm `SPI_BOOT_CRYPT_CNT`) và **không an toàn** — chỉ để thử.
- **Mất khoá ký Secure Boot** = thiết bị đã bán không nhận được bản vá nào.
- Firmware production phải đã ổn định (OTA hoạt động) **trước** khi khoá thiết bị; nếu OTA lỗi thì không còn đường sửa.
- Board demo hiện tại giữ nguyên trạng thái dev để còn sửa và nạp lại phục vụ bảo vệ.

## 11. Lộ trình đề xuất

| Giai đoạn | Việc | Kết quả |
|---|---|---|
| P1 | Hồ sơ `sdkconfig.defaults.production` + kiểm `#error` tuỳ chọn DEV + chỉnh bảng phân vùng; build kiểm đạt (không nạp) | PH-5 |
| P2 | Thử Development mode rồi Release trên board S3 dự phòng theo mục 8 | Bằng chứng PH-1…PH-3 |
| P3 | OTA ký + chống hạ cấp trên thiết bị | PH-4 |
| P4 | DS peripheral cho chứng chỉ Gateway, CSR sinh trên chip, công cụ cấp phát tại xưởng | PH-6 |
| P5 | Gia hạn chứng chỉ tự động, phát hiện nhân bản chắc chắn (hiện mới có nghi vấn qua heartbeat), ghép nối ECDH, pentest | Sẵn sàng thương mại |
