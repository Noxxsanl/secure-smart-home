# Node phòng khách ESP32-S3 — thư viện (bản sơ bộ)

Firmware ESP-IDF v5.4.4 cho Node phòng khách: cảm biến I2C, mic INMP441, loa I2S, LED phát hồng ngoại 940 nm, mắt thu VS1838B, relay HF46F, màn hình TFT 3.5" ILI9488 SPI. Node chỉ nói chuyện với Gateway qua **ESP-NOW**: không giữ WiFi thật của nhà, không biết broker MQTT hay địa chỉ Server.

Thiết kế: [IOT_NODE_NETWORK](../../docs/firmware/IOT_NODE_NETWORK.md) §4.1, §4.3, §5.1, §6.1, §6.3, §7. Hợp đồng ESP-NOW: [API_DESIGN](../../docs/API_DESIGN.md) §11. Lệnh build/nạp chung: [ESP_IDF_BUILD](../../docs/guides/ESP_IDF_BUILD.md).

> **Trạng thái:** mới có **thư viện** (`components/drivers`, `components/services`). `app_main()` chưa gọi gì, đợi chốt sơ đồ chân GPIO (mục [Khi chốt GPIO](#khi-chốt-gpio)). Đã biên dịch bằng ESP-IDF 5.4.4 (0 warning) và kiểm link đủ 67 hàm public (ép linker giữ bằng `-Wl,-u`, vì `app_main` chưa gọi tới). **Chưa chạy trên board**. Gateway S3 chưa có phía ESP-NOW nên chưa thử được luồng đầu-cuối.

## Cấu trúc

```
esp32_s3_firmware_node/
├── CMakeLists.txt               # project; trỏ thêm ../common bằng EXTRA_COMPONENT_DIRS
├── sdkconfig.defaults           # commit; KHÔNG chứa secret. sdkconfig sinh từ file này (gitignore)
├── partitions_node.csv          # nvs 64K, otadata, phy, ota_0/ota_1 3M, log 64K
├── nvs_dev.csv.example          # mẫu identity + ghép nối; bản thật nvs_dev.csv bị gitignore
├── main/
│   ├── CMakeLists.txt
│   └── app_main.c               # rỗng — chờ chốt GPIO
└── components/
    ├── drivers/                 # phần cứng, chia theo THIẾT BỊ; chân GPIO truyền qua *_config_t
    │   ├── include/             # drv_bus.h, drv_sht3x.h, drv_aht20.h, drv_bh1750.h, drv_mic.h,
    │   │                        # drv_speaker.h, drv_ir_nec.h, drv_ir_tx.h, drv_ir_rx.h, drv_relay.h, drv_ili9488.h
    │   └── src/{bus,sensors,audio,ir,relay,lcd}/
    └── services/                # NVS, đồng hồ, ESP-NOW, telemetry có HMAC, kho mã IR
        ├── Kconfig.projbuild    # menu "Node S3: services"
        ├── include/             # node_config.h, node_time.h, node_link.h, node_telemetry.h, node_ir_store.h
        └── src/

../common/                       # dùng chung với Gateway/Camera
├── security_manager/            # HMAC thiết bị (sign, verify thời gian hằng, cửa sổ ±300 s)
└── espnow_proto/                # khung ESP-NOW {ver, type, seq, body JSON} ≤ 250 byte
```

Sau khi chốt GPIO sẽ thêm `components/board/` và `components/application/` (mục [Khi chốt GPIO](#khi-chốt-gpio)).

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
   └──► board ──────────► drivers ──► esp_driver_i2c/spi/i2s/rmt/gpio/ledc, esp_lcd
        (application dùng handle từ board)
```

- `drivers` không biết `services`/`application`; `services` không biết `drivers`. `application` là chỗ duy nhất nối hai bên (VD đổi mã IR đã học trong `node_ir_store` thành lời gọi `drv_ir_tx_send_raw`).
- Ép bằng `REQUIRES`/`PRIV_REQUIRES` trong `CMakeLists.txt`: include sai tầng sẽ báo `No such file`.
- Không có chân GPIO cứng trong thư viện. Chân chỉ nằm ở `board` (sau khi chốt).
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
| `drv_ili9488` | TFT 3.5" 320×480 SPI | `drv_ili9488_init`, `_panel` (esp_lcd), `_fill`, `_set_rotation`, `_set_backlight` | Cài theo `esp_lcd_panel_t`, tự đổi RGB565 → RGB666 (ILI9488 qua SPI không nhận 16 bit). Dùng được với LVGL sau này |

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

## Ràng buộc chân ESP32-S3 (để chốt GPIO)

| Chân | Ràng buộc | Gợi ý |
|---|---|---|
| GPIO0, 3, 45, 46 | Strapping (chế độ khởi động, điện áp flash) | Không dùng cho relay, LED IR, SD ampli. GPIO0 thường là nút BOOT |
| GPIO19, 20 | USB D−/D+ | Giữ nếu nạp/xem log qua cổng USB native |
| GPIO26–32 | Flash/PSRAM trong module | Không dùng |
| GPIO33–37 | Module PSRAM **Octal** (N8R8, N16R8) chiếm 35–37 | Kiểm tên module trước khi dùng |
| GPIO43, 44 | UART0 TX/RX (log) | Giữ nếu nạp/xem log qua UART |
| GPIO39–42 | JTAG | Dùng được nếu không gỡ lỗi JTAG |
| GPIO10–13 | Chân IOMUX của SPI2 (CS 10, MOSI 11, SCLK 12, MISO 13) | Ưu tiên cho LCD: chạy 40 MHz ổn định hơn qua ma trận GPIO |

Tài nguyên ngoại vi (mọi tín hiệu đều đi qua ma trận GPIO, nên chọn chân tự do):

| Thiết bị | Ngoại vi | Số chân |
|---|---|---|
| Cảm biến | I2C0 (dùng chung) | SDA, SCL |
| Mic INMP441 | I2S1 RX | BCLK, WS, DIN |
| Loa | I2S0 TX | BCLK, WS, DOUT, (SD) |
| LED IR | RMT TX | 1 |
| VS1838B | RMT RX | 1 |
| Relay | GPIO | 1 mỗi kênh |
| LCD ILI9488 | SPI2 + LEDC | SCLK, MOSI, CS, DC, (RST), (BL) |

Tổng khoảng 16–18 chân.

## Ghi chú phần cứng

| Thiết bị | Lưu ý |
|---|---|
| HF46F | Cuộn 5 V ăn ~40 mA: kích qua NPN (S8050) hoặc MOSFET (AO3400) + diode 1N4148 song song cuộn + điện trở kéo xuống ở cực B/G. Tải 220 V: cầu chì, khoảng cách an toàn giữa đường 220 V và mạch 3,3 V |
| LED IR 940 nm | Xung ~100 mA để phát xa: kích qua transistor, điện trở hạn dòng theo nguồn (VD 5 V → 22–47 Ω) |
| VS1838B | Cấp **3,3 V** (cấp 5 V thì ngõ ra lên 5 V, quá áp chân S3). RC 100 Ω + 4,7 µF ở chân nguồn |
| INMP441 | 3,3 V; L/R nối GND → kênh trái (mặc định driver) |
| Ampli I2S | MAX98357A cấp 5 V cho công suất lớn hơn; chân GAIN chọn mức khuếch đại |
| ILI9488 | Không nối MISO (SDO) vào bus. Đèn nền 60–100 mA: kích qua transistor nếu module không có |
| I2C | Trở kéo lên 4,7 kΩ (module cảm biến thường có sẵn — nhiều module cùng bus thì trở song song, kiểm lại) |

## Khi chốt GPIO

1. Tạo `components/board/`: `include/board_pins.h` (bảng chân) + `board.c` khởi tạo mọi driver, trả các handle. Đây là chỗ **duy nhất** có số chân.
2. Tạo `components/application/`: luồng nghiệp vụ.
   - Task cảm biến: đọc 30–60 s/lần → `node_telemetry_send` (`temperature`, `humidity`, `light`).
   - `on_cmd`: `turn_on`/`turn_off` → `drv_relay_set` → `node_link_send_cmd_ack(..., power)`; `ir_send` → `node_ir_store_load` → `drv_ir_tx_send_raw`; `ir_learn` → `drv_ir_rx_receive` → `node_ir_store_save`.
   - LCD: nhiệt độ, độ ẩm, trạng thái relay, trạng thái kết nối Gateway (`on_state`).
3. `main/CMakeLists.txt`: `PRIV_REQUIRES board application`; `app_main` chỉ gọi `nvs_flash_init` → `board_init` → `node_app_start`.

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

## Build

Mở **ESP-IDF 5.4 PowerShell** (ESP_IDF_BUILD §1.2):

```powershell
cd E:\WorkSpace\secure-smart-home-iot\firmware\esp32_s3_firmware_node

# sdkconfig hiện có được sinh trước khi có sdkconfig.defaults (single app, chưa có bảng phân vùng riêng) → sinh lại
Remove-Item sdkconfig, sdkconfig.old -ErrorAction SilentlyContinue
idf.py set-target esp32s3
idf.py build
```

Đổi tuỳ chọn không bí mật: `idf.py menuconfig` → *Node S3: services*.

## Nạp identity vào NVS (giai đoạn dev)

Chưa có ghép nối, nên nạp tay (giống `esp32_cam`):

1. Chép `nvs_dev.csv.example` thành `nvs_dev.csv` rồi điền:
   - `device_uuid`, `device_secret`: lấy lúc tạo thiết bị node trên backend (secret chỉ trả **1 lần**).
   - `gateway_mac`: MAC **Station** của Gateway S3.
   - `session_key`: LMK 16 byte = 32 ký tự hex, Gateway đặt đúng LMK này cho peer node. Không để toàn số 0 (bị coi là chưa có).
2. Sinh ảnh và ghi vào phân vùng `nvs` (64K = `0x10000`):

```powershell
python $env:IDF_PATH\components\nvs_flash\nvs_partition_generator\nvs_partition_gen.py generate nvs_dev.csv nvs_dev.bin 0x10000
python $env:IDF_PATH\components\partition_table\parttool.py -p COM7 write_partition --partition-name=nvs --input nvs_dev.bin
Remove-Item nvs_dev.bin
```

## Đề xuất hợp đồng cần chốt

Chưa có trong [API_DESIGN](../../docs/API_DESIGN.md) §11, §14 Q4. Cần chốt cùng backend + Gateway trước khi viết `application`:

| Mục | Đề xuất |
|---|---|
| `action` của node | `turn_on`, `turn_off` (đã có ở backend) + `params.channel` khi nhiều relay; `ir_send {code}`, `ir_learn {code}` (mới) |
| `ts` trong `CMD` Gateway → Node | Gateway thêm `ts` (đã có giờ từ NTP/RTC); node kiểm ±30 s, sau đó bật `CONFIG_NODE_CMD_REQUIRE_TS` |
| Âm thanh | Mic/loa dùng cho việc gì (từ khoá đánh thức tại node, gửi giọng nói cho Agent, âm báo). ESP-NOW 250 byte/gói không hợp để truyền âm thanh liên tục; nếu cần thì đi Local AP của Gateway như Camera (IOT_NODE_NETWORK §5.2) |
