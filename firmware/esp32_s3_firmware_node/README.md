# Node phòng khách ESP32-S3 — thư viện (bản sơ bộ)

Firmware ESP-IDF v5.4.4 cho Node phòng khách: cảm biến I2C, mic INMP441, loa I2S, LED phát hồng ngoại 940 nm, mắt thu VS1838B, relay HF46F, màn hình TFT 3.5" ILI9488 SPI. Node chỉ nói chuyện với Gateway qua **ESP-NOW**: không giữ WiFi thật của nhà, không biết broker MQTT hay địa chỉ Server.

Thiết kế: [IOT_NODE_NETWORK](../../docs/firmware/IOT_NODE_NETWORK.md) §4.1, §4.3, §5.1, §6.1, §6.3, §7. Hợp đồng ESP-NOW: [API_DESIGN](../../docs/API_DESIGN.md) §11. Lệnh build/nạp chung: [ESP_IDF_BUILD](../../docs/guides/ESP_IDF_BUILD.md).

> **Trạng thái:** đã có **thư viện** (`components/drivers`, `components/services`) và **luồng chính `components/application` (`node_app`)**: TFT 3.5" ILI9488 SPI + cảm ứng điện trở XPT2046 + LVGL 8.4.0 (cùng bản Gateway), hiện 2 ô **nhiệt độ / độ ẩm từ SHT31** (mục [Cảm biến nhiệt độ, độ ẩm](#cảm-biến-nhiệt-độ-độ-ẩm-sht31)) cùng phần kiểm tra cảm ứng, tiếng Việt (mục [Màn hình](#màn-hình)). Nhiệt độ/độ ẩm gửi về Gateway qua **ESP-NOW** (TELEMETRY có HMAC, mục [Ghép nối Gateway](#ghép-nối-gateway-nạp-nvs-giai-đoạn-dev)), Gateway hiện ở trang Phòng khách. Chân màn hình và I2C chỉnh trong menuconfig, mặc định theo PCB. Relay, IR, âm thanh, cảm biến khác chưa khởi động, đợi chốt sơ đồ chân (mục [Khi chốt GPIO](#khi-chốt-gpio)). Đã biên dịch bằng ESP-IDF 5.4.4 (0 warning); thư viện chưa gọi tới đã kiểm link bằng `-Wl,-u` (67 hàm services/drivers). **Đã chạy trên PCB** (2026-11-09, COM8): màn hình, SHT31 OK; **đầu-cuối Node → Gateway đã chạy** (Gateway log `TELEMETRY node-living-01 verified` mỗi 10 s, hiện ở trang Phòng khách); cảm ứng chưa đọc được (T_DO luôn 0, xem bảng lỗi Màn hình). Gateway chưa chuyển tiếp được lên Server (thiếu CA, `node-living-01` chưa có trên backend).

## Cấu trúc

```
esp32_s3_firmware_node/
├── CMakeLists.txt               # project; trỏ thêm ../common bằng EXTRA_COMPONENT_DIRS
├── sdkconfig.defaults           # commit; KHÔNG chứa secret. sdkconfig sinh từ file này (gitignore)
├── dependencies.lock            # gitignore (như Gateway): sinh lại khi build, trỏ tới components/lvgl__lvgl theo máy
├── partitions_node.csv          # nvs 64K, otadata, phy, ota_0/ota_1 3M, log 64K
├── nvs_dev.csv.example          # mẫu identity + ghép nối; bản thật nvs_dev.csv bị gitignore
├── main/
│   ├── CMakeLists.txt
│   └── app_main.c               # chỉ gọi node_app_start()
└── components/
    ├── application/             # node_app: NVS → màn hình → ESP-NOW; task climate (SHT31 → màn hình, TELEMETRY → Gateway)
    │   └── Kconfig.projbuild    # menu "Node S3: ứng dụng": chu kỳ gửi về Gateway
    ├── board/                   # chỗ DUY NHẤT có số chân GPIO
    │   ├── Kconfig.projbuild    # menu "Node S3: màn hình" (chân, hướng, xung nhịp, hiệu chuẩn cảm ứng) + "cảm biến I2C"
    │   ├── include/             # board_display.h, board_sensors.h
    │   └── src/
    │       ├── board_display.c  # SPI2 → ILI9488 → LVGL → XPT2046 (như gw_display của Gateway)
    │       └── board_sensors.c  # I2C0 (SDA 15, SCL 7) → SHT31, tự tìm 0x44/0x45
    ├── drivers/                 # phần cứng, chia theo THIẾT BỊ; chân GPIO truyền qua *_config_t
    │   ├── idf_component.yml    # lvgl/lvgl ~8.4.0 từ ESP Registry (cùng bản Gateway)
    │   ├── include/             # drv_bus.h, drv_sht3x.h, drv_aht20.h, drv_bh1750.h, drv_mic.h,
    │   │                        # drv_speaker.h, drv_ir_nec.h, drv_ir_tx.h, drv_ir_rx.h, drv_relay.h, drv_ili9488.h,
    │   │                        # drv_xpt2046.h (cảm ứng), drv_display.h (LVGL)
    │   └── src/{bus,sensors,audio,ir,relay,lcd,touch}/
    ├── lvgl__lvgl/              # LVGL 8.4.0 đặt sẵn như Gateway — gitignore (~99 MB), xem mục LVGL
    ├── services/                # NVS, đồng hồ, ESP-NOW, telemetry có HMAC, kho mã IR
    │   ├── Kconfig.projbuild    # menu "Node S3: services"
    │   ├── include/             # node_config.h, node_time.h, node_link.h, node_telemetry.h, node_ir_store.h
    │   └── src/
    └── ui/                      # giao diện LVGL (như components/ui của Gateway)
        ├── include/node_ui.h
        ├── src/node_ui.c        # ô nhiệt độ/độ ẩm + phần kiểm tra cảm ứng (chấm theo ngón tay, toạ độ, nút bấm thử)
        └── fonts/               # node_font_vi_16/24.c (tiếng Việt có dấu) + gen_fonts.sh

../common/                       # dùng chung với Gateway/Camera
├── security_manager/            # HMAC thiết bị (sign, verify thời gian hằng, cửa sổ ±300 s)
└── espnow_proto/                # khung ESP-NOW {ver, type, seq, body JSON} ≤ 250 byte
```

`board` hiện có màn hình và SHT31. Sau khi chốt GPIO sẽ thêm chân các thiết bị còn lại vào `board`, nối vào `application` (mục [Khi chốt GPIO](#khi-chốt-gpio)).

### Khác với cấu trúc đề xuất ban đầu, và lý do

| Đề xuất | Đã sửa thành | Lý do |
|---|---|---|
| `drivers/{spi,uart,gpio,i2c}` (chia theo bus) | `drivers/src/{bus,sensors,audio,ir,relay,lcd}` (chia theo thiết bị) | ESP-IDF đã có driver bus (`esp_driver_i2c/spi/i2s/rmt/gpio`). Bọc lại chỉ thêm một tầng, thứ cần viết là driver **từng thiết bị**. Phần bus dùng chung (1 bus I2C cho mọi cảm biến, 1 bus SPI cho LCD) nằm trong `drv_bus`. Không có thiết bị UART nên bỏ `uart/`. Mic/loa dùng I2S, IR dùng RMT: bản đề xuất không có chỗ cho hai loại này |
| `services/{wifi,mqtt}` | `services/node_link` (ESP-NOW) | Node không giữ WiFi thật, không nói MQTT (IOT_NODE_NETWORK §4.1). Gateway là client MQTT duy nhất phía nhà (API_DESIGN §9). `node_link` chỉ bật radio WiFi ở chế độ STA không kết nối để chạy ESP-NOW |
| Thư mục con `drivers/spi/`… là component | 1 component mỗi tầng (như `esp32_cam`) | ESP-IDF chỉ quét thư mục con **trực tiếp** của `components/`. `components/drivers/spi/` không được nhận là component nếu không thêm vào `EXTRA_COMPONENT_DIRS` |
| Component tên `mqtt` | — | Trùng tên component `mqtt` (esp-mqtt) của ESP-IDF, sẽ ghi đè thư viện gốc |
| `sdkconfig` trong cây | `sdkconfig.defaults` (commit) | `sdkconfig` sinh tự động và đã gitignore (`firmware/**/sdkconfig`) |
| — | `partitions_node.csv`, `nvs_dev.csv.example`, `Kconfig.projbuild`, `../common` | Cần cho OTA 2 slot + rollback, nạp identity khi dev, tuỳ chọn không bí mật, HMAC dùng chung với Gateway/Camera |

### Quy tắc phụ thuộc

```
main ──► application ──► services ──► common/security_manager, common/espnow_proto
                 ├──► board ──────► drivers ──► esp_driver_i2c/spi/i2s/rmt/gpio/ledc, esp_lcd, lvgl__lvgl
                 └──► ui ─────────► drivers (chỉ drv_display: khoá LVGL)
        (application dùng handle từ board, đẩy dữ liệu vào ui)
```

- `drivers` không biết `services`/`application`; `services` không biết `drivers`. `application` là chỗ duy nhất nối hai bên (VD đổi mã IR đã học trong `node_ir_store` thành lời gọi `drv_ir_tx_send_raw`).
- `ui` không biết `board`/`services`, như `ui` của Gateway: chỉ vẽ, dữ liệu do tầng trên đẩy vào.
- Ép bằng `REQUIRES`/`PRIV_REQUIRES` trong `CMakeLists.txt`: include sai tầng sẽ báo `No such file`.
- Không có chân GPIO cứng trong thư viện. Chân chỉ nằm ở `board` (màn hình: Kconfig của `board`).
- Tiền tố: `drv_` cho drivers, `node_` cho services, để không đụng tên component của ESP Registry (`bh1750_*`, `esp_lcd_ili9488_*`) nếu sau này thêm.

## Thư viện đã có

### drivers

| Module | Thiết bị | API chính | Ghi chú |
|---|---|---|---|
| `drv_bus` | I2C master, SPI master | `drv_i2c_bus_init`, `drv_i2c_bus_scan`, `drv_spi_bus_init` | `scan` in các địa chỉ đang trả lời — dùng khi lắp mạch |
| `drv_sht3x` | SHT30/31/35, 0x44/0x45 | `drv_sht3x_init`, `drv_sht3x_read(°C, %)` | Đo 1 lần ~15 ms, kiểm CRC |
| `drv_aht20` | AHT20/21, 0x38 | `drv_aht20_init`, `drv_aht20_read` | Tự hiệu chuẩn nếu cần, kiểm CRC. Chọn SHT3x **hoặc** AHT20 tuỳ mạch |
| `drv_bh1750` | BH1750/GY-302, 0x23/0x5C | `drv_bh1750_init`, `drv_bh1750_read(lux)` | Đo 1 lần ~180 ms, tự tắt sau đo |
| `drv_mic` | INMP441 (I2S RX) | `drv_mic_init`, `drv_mic_read(int16)`, `drv_mic_rms_dbfs` | 16 kHz mono, 24→16 bit có hệ số khuếch đại, lọc DC |
| `drv_speaker` | Ampli I2S (MAX98357A, NS4168…) | `drv_speaker_init`, `_write`, `_tone`, `_set_volume`, `_enable` | Mono gửi lên cả 2 khe; tắt ampli qua chân SD khi không phát |
| `drv_ir_tx` | LED IR 940 nm (RMT TX) | `drv_ir_tx_send_nec`, `drv_ir_tx_send_raw` | Sóng mang 38 kHz duty 33%, đổi được tần số theo từng mã |
| `drv_ir_rx` | VS1838B (RMT RX) | `drv_ir_rx_receive` → chuỗi mark/space µs | 192 ký hiệu không DMA, bật `use_dma` để học mã điều hoà dài |
| `drv_ir_nec` | Giao thức NEC | `drv_ir_nec_encode`, `drv_ir_nec_decode` | Cùng định dạng mark/space với TX/RX |
| `drv_relay` | HF46F (1–8 kênh) | `drv_relay_set/toggle/get/all_off` | Tắt hết khi init, chặn đổi trạng thái nhanh hơn 200 ms |
| `drv_ili9488` | TFT 3.5" 320×480 SPI | `drv_ili9488_init`, `_panel` (esp_lcd), `_fill`, `_set_rotation`, `_set_backlight` | Cài theo `esp_lcd_panel_t`, tự đổi RGB565 → RGB666 (ILI9488 qua SPI không nhận 16 bit) |
| `drv_xpt2046` | Cảm ứng điện trở XPT2046 (SPI) | `drv_xpt2046_init`, `_read` (điểm ảnh), `_read_raw` (số thô 12 bit) | Chung bus SPI với LCD, 2 MHz. Áp lực Z để nhận chạm, trung vị 5 lần đo, bỏ qua SPI khi T_IRQ cao. Hiệu chuẩn bằng số thô tại 4 mép + `swap_xy` |
| `drv_display` | LVGL 8.4 trên `drv_ili9488` | `drv_display_init(lcd, cfg, &disp)`, `drv_display_add_touch`, `drv_display_lock(ms)`, `drv_display_unlock` | Cùng bản LVGL với Gateway. Tick 2 ms (esp_timer), task `lvgl` ở nhân 1, khoá đệ quy, bộ đệm vẽ 40 dòng trong SRAM (~25 KB dọc / ~38 KB ngang, đổi được sang PSRAM). Cảm ứng đọc trong task LVGL |

### services

| Module | Việc | API chính |
|---|---|---|
| `node_config` | Đọc `identity/*`, `pairing/*` từ NVS; lưu kênh; xoá ghép nối | `node_config_load`, `_save_channel`, `_erase_pairing`, `_wipe` |
| `node_time` | Giờ lấy từ `TIME_SYNC` của Gateway | `node_time_set_unix`, `_is_synced`, `_now` |
| `node_link` | ESP-NOW: dò kênh 1–13 (thử kênh cũ trước), heartbeat 30 s, PING xin giờ, nhận `CMD`, gửi `TELEMETRY`/`EVENT`/`CMD_ACK`, dò lại khi mất ack 3 lần | `node_link_start(cfg, {on_cmd, on_state})`, `_send_telemetry`, `_send_event`, `_send_cmd_ack` |
| `node_telemetry` | Dựng `sensor_payload` có `sn_hmac` lớp 1, ≤ 246 byte | `node_telemetry_build`, `node_telemetry_send` |
| `node_ir_store` | Lưu mã IR đã học (namespace `ir_codes`) | `node_ir_store_save/load/erase` |

`sensor_payload` gửi đi giống hệt payload backend đang nhận, Gateway chỉ cần bọc thêm lớp 2:

```json
{"sensor_id":"<device_id>","sn_timestamp":1762500000,"sn_hmac":"<64 hex>","data":{"temperature":28.4,"humidity":61.0,"light":350}}
```

## Bảo mật

| # | Biện pháp | Ở đâu |
|---|---|---|
| 1 | `device_id`, `secret`, LMK chỉ nằm trong NVS; không log giá trị (chỉ log "set"/"none"); xoá bản sao trong RAM bằng `mbedtls_platform_zeroize` | `node_config`, `node_link` |
| 2 | Telemetry ký `HMAC-SHA256(secret, "<device_id>:<unix_ts>")` hex thường, dùng chung `common/security_manager` với Camera/Gateway (bất biến 5). Chưa có giờ thì **không ký**, không gửi | `node_telemetry` |
| 3 | Peer ESP-NOW **mã hoá** bằng LMK riêng của node. Thiếu LMK thì từ chối chạy, trừ khi bật `[DEV]` trong menuconfig | `node_link_start` |
| 4 | Chỉ nhận khung từ MAC Gateway đã ghép nối; kiểm phiên bản khung, độ dài ≤ 250, body phải là JSON object | `node_link` |
| 5 | Bỏ khung trùng `seq` (8 khung gần nhất) | `node_link` |
| 6 | Lệnh trùng `command_id` (Gateway gửi lại) **không thực thi lần 2**, chỉ gửi lại ack cũ: không bật/tắt relay hai lần | `node_link` |
| 7 | Lệnh có `ts` phải trong ±30 s so với giờ node. `CONFIG_NODE_CMD_REQUIRE_TS` bắt buộc mọi lệnh có `ts` (cần Gateway gửi thêm trường này, xem [Đề xuất hợp đồng](#đề-xuất-hợp-đồng-cần-chốt)) | `node_link` |
| 8 | `command_id` chỉ `[A-Za-z0-9_-]` ≤ 64, `action` chỉ `[a-z0-9_]` ≤ 32, tên trường đo và tên mã IR có kiểm ký tự; `device_id` từ NVS cũng kiểm trước khi ghép vào JSON | `node_link`, `node_telemetry`, `node_ir_store` |
| 9 | Relay tắt hết khi khởi động (đặt mức trước khi bật output), chặn đóng/cắt dồn dập, cảnh báo nếu dùng chân strapping | `drv_relay` |
| 10 | OTA 2 slot + rollback; stack canary; driver WiFi không ghi cấu hình xuống NVS | `sdkconfig.defaults`, `partitions_node.csv` |

**Chưa bật (cho bản production, đốt eFuse không đảo ngược được, làm khi đã ổn định):** Flash Encryption + Secure Boot v2, NVS Encryption (S3 dùng khoá HMAC trong eFuse), tắt JTAG và chế độ tải UART. Theo [Firmware](../../docs/firmware/EMBEDDED_ARCHITECTURE_ESP_IDF.md) và [Bảo mật](../../docs/SECURITY_ARCHITECTURE.md). Chưa có: ghép nối ECDH (`PAIR_*`), PMK chung, ký nội dung `data`.

## Màn hình

> Chi tiết cách LVGL và màn hình được ghép, cách **thay màn hình khác hoặc đổi bản LVGL**: [MAN_HINH_NODE](../../docs/guides/MAN_HINH_NODE.md).

Module **TFT 3.5" ILI9488 SPI, cảm ứng điện trở XPT2046** (320×480, thường kèm khe thẻ SD). LCD và cảm ứng đi **chung bus SPI2**, mỗi chip một chân CS. Code: `board_display` (khởi tạo) → `drv_ili9488` + `drv_xpt2046` + `drv_display` (LVGL) → `node_ui` (giao diện). Cách ghép giống Gateway (`gw_display` → `lvgl_port` + GT911 → `gw_ui`), khác ở chỗ màn hình Node là SPI và cảm ứng điện trở nên phải hiệu chuẩn.

### Đấu dây (chân trên PCB = mặc định menuconfig)

PCB dùng module **ESP32-S3-WROOM-1 N16R8** (flash 16 MB, PSRAM Octal 8 MB), nạp và xem log qua **USB native** (GPIO19/20).

| Chân màn hình | ESP32-S3 | Chân module WROOM-1 | Ghi chú |
|---|---|---|---|
| VCC | 3V3 (hoặc 5V nếu module có ổn áp, xem mạch in) | | Logic 3,3 V |
| GND | GND | | |
| CS | GPIO38 | 31 | |
| RESET | GPIO39 | 32 | `-1` nếu nối RESET lên 3V3 |
| DC/RS | GPIO48 | 25 | |
| SDI (MOSI) | GPIO13 | 21 | chung với T_DIN |
| SCK | GPIO21 | 23 | chung với T_CLK |
| LED | GPIO47 | 24 | PWM đèn nền; `-1` nếu nối thẳng 3V3 |
| SDO (MISO) | **nên để trống** | | ILI9488 không thả trở kháng cao, nối vào net MISO (GPIO12) có thể làm sai số đọc cảm ứng |
| T_CLK | GPIO21 | 23 | nối chung SCK |
| T_CS | GPIO14 | 22 | |
| T_DIN | GPIO13 | 21 | nối chung SDI |
| T_DO | GPIO12 | 20 | MISO của bus |
| T_IRQ | không nối (`-1`) | | Vẫn chạy, chỉ đọc cảm ứng qua SPI liên tục hơn |
| SD_* | để trống | | Chưa dùng thẻ SD |

Các chân này không phải chân IOMUX của SPI2 (10–13) nên tín hiệu đi qua ma trận GPIO: tối đa 40 MHz (mặc định). Ảnh có sọc thì hạ xuống 26/20 MHz.

### Cấu hình

`idf.py menuconfig` → **Node S3: màn hình (ILI9488 + cảm ứng XPT2046)**:

- *Chân GPIO*: như bảng trên.
- *LCD*: hướng (mặc định **ngang 480×320**), xung nhịp SPI (40 MHz; ảnh có sọc thì hạ 26/20), BGR, đảo màu, độ sáng đèn nền.
- *Cảm ứng*: bật/tắt, đổi trục X/Y, 4 số hiệu chuẩn, ngưỡng áp lực, log số đo thô.

Sau khi nạp, màn hình hiện **màn hình kiểm tra**: tiêu đề "Node phòng khách", nút "Bấm thử" có đếm, thanh dưới hiện toạ độ chạm, chấm xanh chạy theo ngón tay.

### Hiệu chuẩn cảm ứng (lần đầu lắp)

Cảm ứng điện trở mỗi tấm lệch một ít, số mặc định chỉ là điểm bắt đầu.

1. Để `Log số đo thô` bật (mặc định), nạp rồi mở `idf.py -p COMx monitor`.
2. Lấy đầu bút/móng tay chạm **sát mép trái** màn hình, đọc dòng `drv_xpt2046: raw X=.. Y=.. Z=..`. Lặp lại với mép phải, trên, dưới.
3. Kéo tay từ trái sang phải: nếu số **Y** thay đổi (X gần như đứng yên) thì bật *Đổi trục X/Y*, ngược lại thì tắt. Khi bật, mép trái/phải lấy số Y, mép trên/dưới lấy số X.
4. Điền 4 số vào *Số đo thô ở mép TRÁI/PHẢI/TRÊN/DƯỚI* (trái lớn hơn phải là bình thường, driver tự hiểu trục ngược). Build, nạp lại, kiểm chấm xanh nằm đúng dưới ngón tay.
5. Xong thì tắt `Log số đo thô`.

Không chạm mà vẫn có toạ độ ("chạm ma") thì tăng *Ngưỡng áp lực*; phải ấn mạnh mới nhận thì giảm. Đổi *Hướng màn hình* thì phải hiệu chuẩn lại.

| Hiện tượng | Kiểm |
|---|---|
| Màn hình trắng, không có gì | Dây CS/DC/SCK/SDI, RESET; hạ xung nhịp xuống 20 MHz |
| Màu đỏ ↔ xanh dương bị đảo | Đổi *Thứ tự màu BGR* |
| Nền đen thành trắng, màu âm bản | Bật *Đảo màu* |
| Ảnh có sọc, nhiễu | Dây ngắn lại, hạ xung nhịp |
| Không nhận chạm | Dây T_CS/T_DO/T_IRQ; log có `touch disabled`? SDO của LCD có lỡ nối vào MISO không |
| Chạm bị lệch/ngược | Hiệu chuẩn lại như trên |

## Cảm biến nhiệt độ, độ ẩm (SHT31)

Module SHT31 (I2C, địa chỉ 0x44 khi ADDR nối GND, 0x45 khi nối VDD; code tự thử cả hai). Code: `board_sensors` (bus I2C + tìm cảm biến) → `drv_sht3x` (đo, kiểm CRC) → task `climate` trong `node_app` (2 s/lần) → `node_ui_set_climate` (2 ô trên màn hình) và mỗi 10 s → TELEMETRY về Gateway.

| Chân SHT31 | ESP32-S3 | Ghi chú |
|---|---|---|
| VIN / VCC | 3V3 | |
| GND | GND | |
| SDA | GPIO15 | |
| SCL | GPIO7 | |
| ADDR | để trống hoặc GND | 0x44 |

menuconfig → **Node S3: cảm biến I2C (SHT31)**: chân SDA/SCL, bật/tắt trở kéo lên trong chip (mặc định bật; module bán sẵn thường đã có trở 4,7–10 kΩ).

Hoạt động:
- Khởi động: log `drv_bus: I2C device at 0x44` (quét bus) rồi `drv_sht3x: SHT3x ready at 0x44`. Log số đo 10 s/lần: `node_app: SHT3x: 26.4 C, 61.2 %RH`.
- Chưa thấy cảm biến: ô hiện `--` + dòng hướng dẫn màu đỏ, cứ 5 s tìm lại (cắm dây sau khi khởi động vẫn nhận, không cần reset).
- Đọc lỗi 3 lần liên tiếp (rút dây khi đang chạy): ô về `--` + dòng hướng dẫn; đọc lại được thì tự hiện số.

| Hiện tượng | Kiểm |
|---|---|
| `no I2C device answered` | Dây SDA/SCL có bị đảo không, nguồn 3V3/GND của module |
| Thấy địa chỉ khác 0x44/0x45 | Không phải SHT3x (AHT20 là 0x38: driver `drv_aht20` có sẵn nhưng chưa nối) |
| `CRC mismatch` thỉnh thoảng | Dây dài/nhiễu: dây ngắn lại, thêm trở kéo lên 4,7 kΩ |
| Nhiệt độ cao hơn phòng 2–5 °C | Cảm biến đặt sát ESP32/ổn áp/đèn nền: đưa ra xa nguồn nhiệt |

## Ràng buộc chân ESP32-S3 (để chốt GPIO)

| Chân | Ràng buộc | Gợi ý |
|---|---|---|
| GPIO0, 3, 45, 46 | Strapping (chế độ khởi động, điện áp flash) | Không dùng cho relay, LED IR, SD ampli. GPIO0 thường là nút BOOT |
| GPIO19, 20 | USB D−/D+ | Giữ nếu nạp/xem log qua cổng USB native |
| GPIO26–32 | Flash/PSRAM trong module | Không dùng |
| GPIO33–37 | PSRAM **Octal** của module N16R8 trên PCB | Không dùng |
| GPIO43, 44 | UART0 TX/RX | PCB log qua USB native (console = USB-Serial-JTAG), nên dùng được |
| GPIO39–42 | JTAG | Dùng được nếu không gỡ lỗi JTAG (GPIO39 đang là LCD RESET) |
| GPIO12, 13, 14, 21, 38, 39, 47, 48 | **Đã dùng cho màn hình** (mục [Màn hình](#màn-hình)) | Chọn chân thiết bị khác ngoài các chân này |
| GPIO7, 15 | **Đã dùng cho I2C** (SCL 7, SDA 15 — mục [SHT31](#cảm-biến-nhiệt-độ-độ-ẩm-sht31)) | Cảm biến I2C khác nối chung 2 chân này |

Tài nguyên ngoại vi (mọi tín hiệu đều đi qua ma trận GPIO, nên chọn chân tự do):

| Thiết bị | Ngoại vi | Số chân |
|---|---|---|
| Cảm biến | I2C0 (dùng chung) | SDA 15, SCL 7 — đã chốt theo PCB |
| Mic INMP441 | I2S1 RX | BCLK, WS, DIN |
| Loa | I2S0 TX | BCLK, WS, DOUT, (SD) |
| LED IR | RMT TX | 1 |
| VS1838B | RMT RX | 1 |
| Relay | GPIO | 1 mỗi kênh |
| LCD ILI9488 + cảm ứng XPT2046 | SPI2 + LEDC (timer 0, kênh 0) | SCLK, MOSI, MISO, CS, DC, RST, BL, T_CS — đã chốt theo PCB (T_IRQ không nối) |

Tổng khoảng 19–21 chân.

## Ghi chú phần cứng

| Thiết bị | Lưu ý |
|---|---|
| HF46F | Cuộn 5 V ăn ~40 mA: kích qua NPN (S8050) hoặc MOSFET (AO3400) + diode 1N4148 song song cuộn + điện trở kéo xuống ở cực B/G. Tải 220 V: cầu chì, khoảng cách an toàn giữa đường 220 V và mạch 3,3 V |
| LED IR 940 nm | Xung ~100 mA để phát xa: kích qua transistor, điện trở hạn dòng theo nguồn (VD 5 V → 22–47 Ω) |
| VS1838B | Cấp **3,3 V** (cấp 5 V thì ngõ ra lên 5 V, quá áp chân S3). RC 100 Ω + 4,7 µF ở chân nguồn |
| INMP441 | 3,3 V; L/R nối GND → kênh trái (mặc định driver) |
| Ampli I2S | MAX98357A cấp 5 V cho công suất lớn hơn; chân GAIN chọn mức khuếch đại |
| ILI9488 + XPT2046 | Không nối SDO của LCD vào bus; MISO chỉ nối T_DO. Đèn nền 60–100 mA: module thường có sẵn transistor ở chân LED, nếu không thì tự kích qua transistor |
| I2C | Trở kéo lên 4,7 kΩ (module cảm biến thường có sẵn — nhiều module cùng bus thì trở song song, kiểm lại) |

## Khi chốt GPIO

1. Thêm vào `components/board/` (đã có màn hình + bus I2C/SHT31): chân cảm biến khác, relay, IR, âm thanh vào `Kconfig.projbuild` (hoặc `board_pins.h`) + hàm khởi tạo driver, trả các handle. Đây là chỗ **duy nhất** có số chân.
2. `components/application/` (đã có `node_app`: màn hình, SHT31, ESP-NOW, gửi `temperature`/`humidity`):
   - Task `climate`: thêm `light` khi có BH1750.
   - `on_cmd` (hiện trả lỗi mọi lệnh vì chưa có thiết bị chấp hành): `turn_on`/`turn_off` → `drv_relay_set` → `node_link_send_cmd_ack(..., power)`; `ir_send` → `node_ir_store_load` → `drv_ir_tx_send_raw`; `ir_learn` → `drv_ir_rx_receive` → `node_ir_store_save`.
   - Màn hình: thay màn hình kiểm tra trong `node_ui` bằng màn hình thật (nhiệt độ, độ ẩm, trạng thái relay, kết nối Gateway đã có ở góc phải), dữ liệu đẩy vào qua `node_ui_set_*` như `gw_ui`. Nút trên màn hình gọi ngược lên application (callback), `ui` không gọi thẳng driver relay.
3. Khởi tạo board còn lại trong `node_app_start` (sau `board_display_init`).

Phác thảo nối thư viện (chân là chỗ giữ chỗ `BOARD_*`):

```c
drv_i2c_bus_config_t i2c = {.port = I2C_NUM_0, .sda_gpio = BOARD_I2C_SDA, .scl_gpio = BOARD_I2C_SCL};
i2c_master_bus_handle_t bus;
ESP_ERROR_CHECK(drv_i2c_bus_init(&i2c, &bus));
size_t n; drv_i2c_bus_scan(bus, NULL, 0, &n);            /* in địa chỉ cảm biến đang trả lời */

drv_sht3x_handle_t sht; drv_sht3x_init(bus, DRV_SHT3X_ADDR_DEFAULT, &sht);
drv_bh1750_handle_t bh;  drv_bh1750_init(bus, DRV_BH1750_ADDR_LOW, &bh);

drv_relay_channel_t ch[] = {{.gpio = BOARD_RELAY_1, .active_high = true}};
drv_relay_config_t rc = {.channels = ch, .count = 1};
drv_relay_handle_t relay; drv_relay_init(&rc, &relay);

node_config_t cfg;
if (node_config_load(&cfg) == ESP_OK) {
    node_link_callbacks_t cbs = {.on_cmd = on_cmd, .on_state = on_state, .ctx = relay};
    node_link_start(&cfg, &cbs);
}

float t, h, lux;
drv_sht3x_read(sht, &t, &h);
drv_bh1750_read(bh, &lux);
node_metric_t m[] = {{"temperature", t, 1}, {"humidity", h, 1}, {"light", lux, 0}};
node_telemetry_send(&cfg, m, 3);
```

Màn hình đã nối sẵn: xem `components/board/src/board_display.c` (SPI → ILI9488 → LVGL → XPT2046) và `components/application/src/node_app.c`. Mọi lời gọi `lv_*` ngoài task LVGL phải nằm giữa `drv_display_lock(-1)` / `drv_display_unlock()`.

### LVGL

- Bản **8.4.0**, cùng Gateway (`08_lvgl_Porting` khoá 8.4.0) để code giao diện viết một kiểu cho cả hai màn hình. Khai báo ở `components/drivers/idf_component.yml` (`~8.4.0`: nhận bản vá 8.4.x, không lên 8.5/9).
- Mã nguồn đặt ở `components/lvgl__lvgl/` giống Gateway: component manager thấy component cùng tên trong `components/` thì dùng bản này (build không cần mạng, sửa/đọc được mã LVGL tại chỗ). Thư mục này và `dependencies.lock` bị gitignore. Máy mới clone về không có thư mục này nên lần build đầu cần Internet: component manager tải LVGL theo `idf_component.yml` vào `managed_components/`. Muốn đặt lại vào `components/` thì chuyển `managed_components/lvgl__lvgl` sang `components/lvgl__lvgl`.
- Cấu hình LVGL nằm cuối `sdkconfig.defaults` (Kconfig, không dùng `lv_conf.h`). Không bật `LV_COLOR_16_SWAP`: `drv_ili9488` nhận RGB565 theo thứ tự byte CPU rồi tự đổi sang RGB666. Bật nhầm thì `drv_display.c` báo lỗi lúc build.
- Font Montserrat có sẵn của LVGL chỉ có ASCII. Giao diện tiếng Việt có dấu (bất biến 10) dùng `components/ui/fonts/node_font_vi_16/24.c`: chép từ `gw_font_vi_16/24.c` của Gateway, chỉ đổi tên symbol (cùng tham số lv_font_conv, font nén RLE nên cần `LV_USE_FONT_COMPRESSED`). Cần cỡ chữ/ký tự khác thì sửa và chạy `components/ui/fonts/gen_fonts.sh` (cần Node.js, `npx` tải lv_font_conv). Có `LV_SYMBOL_` HOME, OK, WIFI, WARNING, LIST, VIDEO, UPLOAD; biểu tượng khác phải thêm vào script.

## Build

Mở **ESP-IDF 5.4 PowerShell** (ESP_IDF_BUILD §1.2):

```powershell
cd E:\WorkSpace\secure-smart-home-iot\firmware\esp32_s3_firmware_node

# sdkconfig hiện có được sinh trước khi có sdkconfig.defaults (single app, chưa có bảng phân vùng riêng) → sinh lại
Remove-Item sdkconfig, sdkconfig.old -ErrorAction SilentlyContinue
idf.py set-target esp32s3
idf.py build
```

Có sẵn `components/lvgl__lvgl/` thì build không cần mạng. Chưa có (máy mới clone) thì lần build đầu cần Internet để tải LVGL (mục [LVGL](#lvgl)).

Đổi tuỳ chọn không bí mật: `idf.py menuconfig` → *Node S3: services*, *Node S3: ứng dụng*; chân/hiệu chuẩn màn hình ở *Node S3: màn hình*; LVGL ở *Component config → LVGL configuration*.

## Ghép nối Gateway (nạp NVS, giai đoạn dev)

Chưa có ghép nối ECDH nên nạp tay **cả hai phía** với cùng `device_id`, secret và LMK:

| Phía | File (gitignore) | Mục |
|---|---|---|
| Node | `nvs_dev.csv` (mẫu `nvs_dev.csv.example`) | `identity/device_uuid`, `identity/device_secret`, `pairing/gateway_mac` = MAC **Station** của Gateway, `pairing/session_key` = LMK 32 hex (không để toàn số 0) |
| Gateway | `08_lvgl_Porting/nvs_dev.csv` | thêm 1 mục vào `nodes`: `<i>_kind` = `node`, `<i>_id`, `<i>_secret` (trùng node), `<i>_mac` = MAC Station của node, `<i>_lmk` (trùng `session_key`), tăng `count` |

MAC Station: dòng `MAC:` khi chạy `python -m esptool --port COMx flash_id` (S3: MAC Station = MAC gốc), hoặc log Gateway `gateway STA MAC ...`. `device_id`/secret thật lấy lúc tạo thiết bị trên backend (secret chỉ trả **1 lần**) — chỉ cần khi muốn Server nhận số đo; Gateway hiện được số đo chỉ cần 2 phía khớp nhau. Bản demo hiện tại: `node-living-01`, secret/LMK sinh ngẫu nhiên (chưa có trên backend).

Sinh ảnh rồi ghi vào phân vùng `nvs`. Kích thước lấy từ bảng phân vùng đã build (`partitions_node.csv`: nvs 64K). App có WiFi/ESP-NOW ~1,1 MB nên **bắt buộc** dùng bảng này (bảng mặc định chỉ có app 1 MB → `app partition is too small`); sdkconfig tạo trước khi có `sdkconfig.defaults` thì đổi trong menuconfig → *Partition Table*:

```powershell
$size = python $env:IDF_PATH\components\partition_table\parttool.py --partition-table-file build\partition_table\partition-table.bin get_partition_info --partition-name nvs --info size
python $env:IDF_PATH\components\nvs_flash\nvs_partition_generator\nvs_partition_gen.py generate nvs_dev.csv nvs_dev.bin $size
python $env:IDF_PATH\components\partition_table\parttool.py -p COM8 --partition-table-file build\partition_table\partition-table.bin write_partition --partition-name=nvs --input nvs_dev.bin
Remove-Item nvs_dev.bin
```

Gateway: làm như README của Gateway (mục Nạp NVS), rồi khởi động lại. Ghi đè cả phân vùng nên mất "lần cuối thấy" đã lưu của thiết bị — không ảnh hưởng gì khác.

Sau khi cả hai đã nạp:
- Node: góc phải màn hình "Đang tìm Gateway..." (vàng) → "Đã nối Gateway" → "Đã gửi lúc HH:MM:SS" (xanh). Log: `node_link: gateway ... found on channel N`, `node_time: ... gateway`, `node_app: telemetry sent to gateway`.
- Gateway: log `gw_espnow: TELEMETRY node-living-01 verified`; trang **Phòng khách** hiện nhiệt độ/độ ẩm, trang **Thiết bị** có node chấm xanh.

| Hiện tượng (node) | Kiểm |
|---|---|
| "Chưa ghép nối Gateway" (đỏ) | Log `node not provisioned` / `ESP-NOW not started`: chưa nạp NVS hoặc thiếu `gateway_mac`/`session_key` |
| "Đang tìm Gateway..." mãi | Gateway chưa bật / chưa có node này trong `nodes`; `gateway_mac` phải là MAC **Station** (không phải AP) |
| Log `gateway acks at MAC level but sends no TIME_SYNC` | LMK hai phía khác nhau, hoặc Gateway chưa có giờ (chưa vào mạng/NTP) |
| Gateway log `drop TELEMETRY ... sensor_id does not match` / `bad signature` | `device_id`/secret hai phía khác nhau |

## Đề xuất hợp đồng cần chốt

Chưa có trong [API_DESIGN](../../docs/API_DESIGN.md) §11, §14 Q4. Cần chốt cùng backend + Gateway trước khi viết `application`:

| Mục | Đề xuất |
|---|---|
| `action` của node | `turn_on`, `turn_off` (đã có ở backend) + `params.channel` khi nhiều relay; `ir_send {code}`, `ir_learn {code}` (mới) |
| `ts` trong `CMD` Gateway → Node | Gateway thêm `ts` (đã có giờ từ NTP/RTC); node kiểm ±30 s, sau đó bật `CONFIG_NODE_CMD_REQUIRE_TS` |
| Trạng thái thiết bị trong telemetry `data` (màn hình Gateway, trang Phòng khách — đã đọc sẵn) | `fan`, `ac`, `lamp`: `0`/`1` (hoặc `false`/`true`); `ac_temp`: °C đặt; `curtain`: `0` đóng, `1` mở, `2..100` mở theo %. Đèn dùng `lamp` vì `light` đã là lux. Gửi chung với số đo hoặc một gói `TELEMETRY` riêng mỗi khi đổi trạng thái (gói chỉ có 5 trường này ~220 byte, dưới giới hạn 246); Gateway chỉ cập nhật trường có mặt. Quạt/đèn từ `drv_relay`, điều hoà/rèm là trạng thái node tự nhớ sau lệnh IR (không có phản hồi thật) |
| Âm thanh | Mic/loa dùng cho việc gì (từ khoá đánh thức tại node, gửi giọng nói cho Agent, âm báo). ESP-NOW 250 byte/gói không hợp để truyền âm thanh liên tục; nếu cần thì đi Local AP của Gateway như Camera (IOT_NODE_NETWORK §5.2) |
