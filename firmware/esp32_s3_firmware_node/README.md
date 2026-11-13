# Node phòng khách ESP32-S3

Firmware ESP-IDF v5.4.4 cho Node phòng khách: cảm biến SHT31 (I2C), màn hình TFT 3.5" ILI9488 SPI + cảm ứng XPT2046, LED phát hồng ngoại 940 nm + mắt thu VS1838B (điều hòa), relay HF46F 12 V (đèn, quạt), động cơ bước 28BYJ-48 qua ULN2003 (rèm cửa), LED RGB WS2812 (báo trạng thái), mic INMP441 + loa NS4168 qua I2S (viết sẵn, mặc định tắt). Node chỉ nói chuyện với Gateway qua **ESP-NOW**: không giữ WiFi thật của nhà, không biết broker MQTT hay địa chỉ Server.

Thiết kế: [IOT_NODE_NETWORK](../../docs/firmware/IOT_NODE_NETWORK.md) §4.1, §4.3, §5.1, §6.1, §6.3, §7. Hợp đồng ESP-NOW: [API_DESIGN](../../docs/API_DESIGN.md) §11. Lệnh build/nạp chung: [ESP_IDF_BUILD](../../docs/guides/ESP_IDF_BUILD.md).

> **Trạng thái (2026-11-13):** đủ mọi tải theo sơ đồ chân của PCB (mục [Sơ đồ chân](#sơ-đồ-chân-pcb-node-phòng-khách)):
> - **Màn hình** TFT 3.5" + cảm ứng + LVGL 8.4.0 (cùng bản Gateway), tiếng Việt: 2 ô **nhiệt độ / độ ẩm từ SHT31**, 4 ô **Đèn / Quạt / Rèm cửa / Điều hòa** nhận chạm (mục [Màn hình](#màn-hình)).
> - **Điều hòa qua hồng ngoại** (VS1838B GPIO1 học mã remote, LED IR GPIO2 phát lại — [Học mã IR điều hòa](../../docs/guides/HOC_MA_IR_DIEU_HOA.md)).
> - **Đèn, quạt** qua relay HF46F 12 V (GPIO41, GPIO42), **rèm** qua động cơ bước 28BYJ-48 + ULN2003 (GPIO8/18/17/16, hiệu chuẩn trên màn hình); đèn/quạt khôi phục trạng thái khi có điện lại (mục [Đèn, quạt, rèm cửa](#đèn-quạt-rèm-cửa)).
> - **LED WS2812** (GPIO40) báo trạng thái (mục [LED debug](#led-debug-ws2812)); **mic INMP441 + loa NS4168** viết sẵn, mặc định tắt (mục [Mic và loa](#mic-và-loa-mặc-định-tắt)).
> - Số đo + trạng thái tải gửi về Gateway qua **ESP-NOW** (TELEMETRY có HMAC); Server điều khiển mọi tải qua Gateway (mục [Hợp đồng lệnh và telemetry](#hợp-đồng-lệnh-và-telemetry)).
>
> Đã chạy trên PCB (2026-11-09, COM8): màn hình, SHT31, đầu-cuối Node → Gateway (`TELEMETRY node-living-01 verified` mỗi 10 s), điều hòa IR. **Relay, rèm, LED WS2812 mới biên dịch (ESP-IDF 5.4.4, 0 warning, cả cấu hình bật mic/loa), chưa nạp thử trên mạch** — làm theo mục [Chạy thử trên mạch](#chạy-thử-trên-mạch-sau-khi-nạp). Cảm ứng: T_DO luôn 0 khi SDO của LCD còn nối chung GPIO12; nay SDO để trống, GPIO12 chỉ nối T_DO — chưa thử lại trên board.

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
    ├── application/             # luồng nghiệp vụ, chỗ duy nhất nối board ↔ services ↔ ui
    │   ├── Kconfig.projbuild    # menu "Node S3: ứng dụng": chu kỳ gửi, khôi phục đèn/quạt, bíp, thử mic
    │   └── src/
    │       ├── node_app.c       # LED → NVS → màn hình → ESP-NOW → tải; task climate (SHT31), task report (TELEMETRY, LED)
    │       ├── node_ac.c        # điều hòa IR: học mã remote, phát mã
    │       ├── node_switches.c  # đèn, quạt (relay), khôi phục sau mất điện
    │       ├── node_curtain.c   # rèm (động cơ bước): lệnh, vị trí + hiệu chuẩn lưu NVS
    │       ├── node_status_led.c # LED WS2812 báo trạng thái
    │       └── node_audio.c     # mic + loa — mặc định TẮT
    ├── board/                   # chỗ DUY NHẤT có số chân GPIO
    │   ├── Kconfig.projbuild    # menu "Node S3: màn hình", "cảm biến I2C", "hồng ngoại", "relay", "rèm cửa",
    │   │                        # "LED debug", "âm thanh"
    │   ├── include/             # board_display.h, board_sensors.h, board_ir.h, board_loads.h, board_led.h, board_audio.h
    │   └── src/
    │       ├── board_display.c  # SPI2 → ILI9488 → LVGL → XPT2046 (như gw_display của Gateway)
    │       ├── board_sensors.c  # I2C0 (SDA 15, SCL 7) → SHT31, tự tìm 0x44/0x45
    │       ├── board_ir.c       # VS1838B (RMT RX + DMA, GPIO1) + LED IR 940 nm (RMT TX 38 kHz, GPIO2)
    │       ├── board_loads.c    # relay đèn GPIO41 / quạt GPIO42 + ULN2003 IN1..IN4 = GPIO8/18/17/16
    │       ├── board_led.c      # WS2812 GPIO40 (RMT TX), độ sáng theo menuconfig
    │       └── board_audio.c    # INMP441 (I2S1: 4/5/6) + NS4168 (I2S0: 10/11/9)
    ├── drivers/                 # phần cứng, chia theo THIẾT BỊ; chân GPIO truyền qua *_config_t
    │   ├── idf_component.yml    # lvgl/lvgl ~8.4.0 từ ESP Registry (cùng bản Gateway)
    │   ├── include/             # drv_bus.h, drv_sht3x.h, drv_aht20.h, drv_bh1750.h, drv_mic.h,
    │   │                        # drv_speaker.h, drv_ir_nec.h, drv_ir_tx.h, drv_ir_rx.h, drv_relay.h, drv_stepper.h,
    │   │                        # drv_ws2812.h, drv_ili9488.h, drv_xpt2046.h (cảm ứng), drv_display.h (LVGL)
    │   └── src/{bus,sensors,audio,ir,relay,stepper,led,lcd,touch}/
    ├── lvgl__lvgl/              # LVGL 8.4.0 đặt sẵn như Gateway — gitignore (~99 MB), xem mục LVGL
    ├── services/                # NVS, đồng hồ, ESP-NOW, telemetry có HMAC, kho mã IR, trạng thái tải
    │   ├── Kconfig.projbuild    # menu "Node S3: services"
    │   ├── include/             # node_config.h, node_time.h, node_link.h, node_telemetry.h, node_ir_store.h,
    │   │                        # node_state_store.h
    │   └── src/
    └── ui/                      # giao diện LVGL (như components/ui của Gateway)
        ├── include/node_ui.h
        ├── src/node_ui.c        # ô nhiệt độ/độ ẩm, 4 ô thiết bị nhận chạm, bảng Điều hòa, bảng Rèm cửa, kiểm tra cảm ứng
        └── fonts/               # node_font_vi_16/24.c (tiếng Việt có dấu) + gen_fonts.sh

../common/                       # dùng chung với Gateway/Camera
├── security_manager/            # HMAC thiết bị (sign, verify thời gian hằng, cửa sổ ±300 s)
└── espnow_proto/                # khung ESP-NOW {ver, type, seq, body JSON} ≤ 250 byte
```

`board` có đủ mọi thiết bị trên PCB (mục [Sơ đồ chân](#sơ-đồ-chân-pcb-node-phòng-khách)). Thêm thiết bị mới: mục [Thêm thiết bị](#thêm-thiết-bị).

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
| `drv_relay` | HF46F (1–8 kênh) | `drv_relay_set/toggle/get/all_off` | Tắt hết khi init, chặn đổi trạng thái nhanh hơn `min_switch_interval_ms` (Node đặt 500 ms) |
| `drv_stepper` | Động cơ bước 4 pha 28BYJ-48 qua ULN2003 | `drv_stepper_move_to`, `_stop`, `_set_position`, `_position`, `_is_moving`, callback dừng | Nửa bước (8 pha, 4096 bước/vòng), đếm bằng esp_timer, không chặn task gọi; đang chạy đổi đích được; 32 bước đầu chạy chậm gấp đôi; dừng thì **ngắt dòng cuộn dây** |
| `drv_ws2812` | LED WS2812B/SK6812 (RMT TX) | `drv_ws2812_set`, `_show`, `_clear` | Copy encoder + chuỗi ký hiệu dựng sẵn (0,1 µs/tick), kèm mã reset 300 µs; không cần thư viện `led_strip` |
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
| `node_state_store` | Trạng thái tải giữ qua mất điện (namespace `loads`: `lamp`, `fan`, `cur_pos`, `cur_travel`) | `node_state_get/set_u8`, `node_state_get/set_i32` |

`sensor_payload` gửi đi giống hệt payload backend đang nhận, Gateway chỉ cần bọc thêm lớp 2:

```json
{"sensor_id":"<device_id>","sn_timestamp":1762500000,"sn_hmac":"<64 hex>","data":{"temperature":28.4,"humidity":61.0,"ac":1,"ac_temp":26,"lamp":1,"fan":0,"curtain":45}}
```

Ý nghĩa từng trường: mục [Hợp đồng lệnh và telemetry](#hợp-đồng-lệnh-và-telemetry).

## Bảo mật

| # | Biện pháp | Ở đâu |
|---|---|---|
| 1 | `device_id`, `secret`, LMK chỉ nằm trong NVS; không log giá trị (chỉ log "set"/"none"); xoá bản sao trong RAM bằng `mbedtls_platform_zeroize` | `node_config`, `node_link` |
| 2 | Telemetry ký `HMAC-SHA256(secret, "<device_id>:<unix_ts>")` hex thường, dùng chung `common/security_manager` với Camera/Gateway (bất biến 5). Chưa có giờ thì **không ký**, không gửi | `node_telemetry` |
| 3 | Peer ESP-NOW **mã hoá** bằng LMK riêng của node. Thiếu LMK thì từ chối chạy, trừ khi bật `[DEV]` trong menuconfig | `node_link_start` |
| 4 | Chỉ nhận khung từ MAC Gateway đã ghép nối; kiểm phiên bản khung, độ dài ≤ 250, body phải là JSON object | `node_link` |
| 5 | Bỏ khung trùng `seq` (8 khung gần nhất) | `node_link` |
| 6 | Lệnh trùng `command_id` (Gateway gửi lại) **không thực thi lần 2**, chỉ gửi lại ack cũ: không bật/tắt relay hai lần | `node_link` |
| 7 | Lệnh có `ts` phải trong ±30 s so với giờ node. `CONFIG_NODE_CMD_REQUIRE_TS` bắt buộc mọi lệnh có `ts` (Gateway đã gửi `ts`, xem [Hợp đồng](#hợp-đồng-lệnh-và-telemetry)) | `node_link` |
| 8 | `command_id` chỉ `[A-Za-z0-9_-]` ≤ 64, `action` chỉ `[a-z0-9_]` ≤ 32, tên trường đo và tên mã IR có kiểm ký tự; `device_id` từ NVS cũng kiểm trước khi ghép vào JSON | `node_link`, `node_telemetry`, `node_ir_store` |
| 9 | Relay tắt hết khi khởi động (đặt mức trước khi bật output) rồi mới khôi phục trạng thái đã lưu (cách nhau 300 ms); chặn đóng/cắt nhanh hơn 500 ms; cảnh báo nếu dùng chân strapping | `drv_relay`, `node_switches` |
| 10 | Rèm: cuộn dây động cơ không cấp điện lúc khởi động và khi dừng; có điện lại thì **không tự chạy**; lệnh chạy luôn bị chặn trong [0, hành trình] (chỉ nút nhích lúc hiệu chuẩn mới vượt, mỗi lần ≤ 1024 bước nên lỡ mất sự kiện thả tay vẫn tự dừng); đang hiệu chuẩn thì từ chối lệnh từ xa | `drv_stepper`, `node_curtain` |
| 11 | Lệnh xếp hàng quá 2,5 s (Gateway đã báo hết giờ) bị bỏ, không đóng relay / chạy rèm / phát IR muộn | `node_switches`, `node_curtain`, `node_ac` |
| 12 | OTA 2 slot + rollback; stack canary; driver WiFi không ghi cấu hình xuống NVS | `sdkconfig.defaults`, `partitions_node.csv` |

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
| SDO (MISO) | **để trống** | | LCD chỉ ghi, không cần MISO. ILI9488 không thả SDO về trở kháng cao: nối chung GPIO12 với T_DO thì cảm ứng đọc ra toàn 0 |
| T_CLK | GPIO21 | 23 | **bắt buộc nối**: chân riêng trên module, không nối sẵn với SCK — đi dây chung GPIO21 |
| T_CS | GPIO14 | 22 | |
| T_DIN | GPIO13 | 21 | **bắt buộc nối**: chân riêng trên module, không nối sẵn với SDI — đi dây chung GPIO13 |
| T_DO | GPIO12 | 20 | MISO duy nhất của bus, chỉ nối T_DO (menuconfig *Cảm ứng T_DO*) |
| T_IRQ | không nối (`-1`) | | Vẫn chạy, chỉ đọc cảm ứng qua SPI liên tục hơn |
| SD_* | để trống | | Chưa dùng thẻ SD |

Các chân này không phải chân IOMUX của SPI2 (10–13) nên tín hiệu đi qua ma trận GPIO: tối đa 40 MHz (mặc định). Ảnh có sọc thì hạ xuống 26/20 MHz.

### Cấu hình

`idf.py menuconfig` → **Node S3: màn hình (ILI9488 + cảm ứng XPT2046)**:

- *Chân GPIO*: như bảng trên.
- *LCD*: hướng (mặc định **ngang 480×320**), xung nhịp SPI (40 MHz; ảnh có sọc thì hạ 26/20), BGR, đảo màu, độ sáng đèn nền.
- *Cảm ứng*: bật/tắt, đổi trục X/Y, 4 số hiệu chuẩn, ngưỡng áp lực, log số đo thô.

Sau khi nạp, màn hình (ngang 480×320):

```
┌──────────────────────────────────────────────────────────┐
│ Living Room                    Th 7, 14/11/2026  21:05  ●│  ngày giờ (giờ do Gateway cấp) + chấm kết nối Gateway
│ ┌ Nhiệt độ ──────────────┐ ┌ Độ ẩm ───────────────────┐  │
│ │  23.1               °C │ │  86                    % │  │
│ └────────────────────────┘ └──────────────────────────┘  │
│ ┌ Đèn            [══●] ┐ ┌ Quạt                 [●══] ┐  │  lưới 2×2, mỗi ô 1 công tắc gạt
│ │                      │ │                            │  │  (nền xanh = đang bật/mở)
│ └──────────────────────┘ └────────────────────────────┘  │
│ ┌ Rèm cửa         [══●] ┐ ┌ Điều hòa            [══●] ┐  │
│ │ [  50%  ] [ 100%  ]   │ │ Đặt 26°C                  │  │
│ └───────────────────────┘ └───────────────────────────┘  │
│ (wifi)  Sẵn sàng                                         │  biểu tượng kết nối + dòng thông báo
└──────────────────────────────────────────────────────────┘
```

- **Tiêu đề**: "Living Room", ngày giờ (`--/--/----  --:--` khi chưa nối Gateway, vì Node lấy giờ từ Gateway), chấm **xanh** = đã nối Gateway, **vàng** = đang tìm, **đỏ** = chưa ghép nối.
- **Công tắc**: Đèn, Quạt, Điều hòa = bật/tắt; Rèm = mở lại mức vừa dùng (mặc định 100 %) / đóng hẳn. Bấm 50 % / 100 % để chọn độ mở (nút đang có hiệu lực tô xanh dương). Ô không có chữ trạng thái — công tắc và nền xanh đã cho biết; chỉ Điều hòa hiện "Đặt 26°C" khi đang bật và Rèm hiện "Đang chạy" khi động cơ chạy. Công tắc luôn quay về trạng thái thật: thao tác bị từ chối (VD bấm quá nhanh) thì công tắc trả lại và dòng thông báo nói lý do. Chạm phần còn lại của ô Đèn / Quạt cũng bật/tắt; của ô **Rèm** mở bảng Rèm (DỪNG + hiệu chuẩn); của ô **Điều hòa** mở bảng Điều hòa.
- **Dòng dưới cùng**: biểu tượng sóng cùng màu chấm kết nối (Node không vào WiFi nhà nên không có IP) + thông báo: "Sẵn sàng", việc vừa xảy ra trong 5 giây ("Lệnh từ xa: bật đèn", "Đèn: bấm quá nhanh…", "Điều hòa: chưa học mã 26°C"), lỗi cảm biến màu đỏ cho tới khi hết lỗi.
- Ô của thiết bị tắt trong menuconfig: công tắc mờ, dòng phụ "Chưa lắp".

**Bảng Điều hòa** (chạm ô Điều hòa): công tắc **Nguồn**; nhiệt độ đặt cỡ lớn với nút **−** / **+** và **thanh kéo 16–30°C** (ngừng chỉnh 0,6 giây mới phát mã); nhiệt độ + độ ẩm phòng; nút **Học mã** mở lưới 16 ô (TẮT, 16..30°C, ô đã học có dấu ✓ nền xanh) — chạm ô để học, khi chờ remote có **thanh đếm ngược 10 giây** và ô nháy viền; giữ lâu ô đã học để phát thử. Mức nhiệt chưa học mã: số chuyển vàng, không gửi lệnh, dòng dưới hướng dẫn học. Chi tiết: [Học mã IR điều hòa](../../docs/guides/HOC_MA_IR_DIEU_HOA.md).

Trạng thái đẩy vào bằng `node_ui_set_device` (−1 chưa biết, 0 tắt, 1 bật), `node_ui_set_curtain`, `node_ui_set_ac_setpoint`, `node_ui_set_notice`, cùng quy ước khoá `lamp/fan/curtain/ac/ac_temp` mà trang Living Room của Gateway đọc.

### Hiệu chuẩn cảm ứng (lần đầu lắp)

Cảm ứng điện trở mỗi tấm lệch một ít, số mặc định chỉ là điểm bắt đầu.

1. Để `Log số đo thô` bật (mặc định) và bật *Hiện chấm theo ngón tay + toạ độ chạm* (menuconfig *Node S3: màn hình* → *Cảm ứng*, mặc định tắt), nạp rồi mở `idf.py -p COMx monitor`.
2. Lấy đầu bút/móng tay chạm **sát mép trái** màn hình, đọc dòng `drv_xpt2046: raw X=.. Y=.. Z=..`. Lặp lại với mép phải, trên, dưới.
3. Kéo tay từ trái sang phải: nếu số **Y** thay đổi (X gần như đứng yên) thì bật *Đổi trục X/Y*, ngược lại thì tắt. Khi bật, mép trái/phải lấy số Y, mép trên/dưới lấy số X.
4. Điền 4 số vào *Số đo thô ở mép TRÁI/PHẢI/TRÊN/DƯỚI* (trái lớn hơn phải là bình thường, driver tự hiểu trục ngược). Build, nạp lại, kiểm chấm xanh nằm đúng dưới ngón tay.
5. Xong thì tắt `Log số đo thô` và *Hiện chấm theo ngón tay* (chấm + toạ độ chỉ hiện khi chạm vào chỗ trống của màn hình).

Không chạm mà vẫn có toạ độ ("chạm ma") thì tăng *Ngưỡng áp lực*; phải ấn mạnh mới nhận thì giảm. Đổi *Hướng màn hình* thì phải hiệu chuẩn lại.

| Hiện tượng | Kiểm |
|---|---|
| Màn hình trắng, không có gì | Dây CS/DC/SCK/SDI, RESET; hạ xung nhịp xuống 20 MHz |
| Màu đỏ ↔ xanh dương bị đảo | Đổi *Thứ tự màu BGR* |
| Nền đen thành trắng, màu âm bản | Bật *Đảo màu* |
| Ảnh có sọc, nhiễu | Dây ngắn lại, hạ xung nhịp |
| Không nhận chạm, T_DO đọc toàn 0 | Đủ 4 dây cảm ứng chưa: T_CLK → GPIO21, T_DIN → GPIO13, T_CS → GPIO14, T_DO → GPIO12 (thiếu T_CLK/T_DIN thì XPT2046 không nhận lệnh). Log `drv_xpt2046: self-test` lúc khởi động chỉ ra lỗi; SDO của LCD phải để trống |
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

## Đèn, quạt, rèm cửa

### Đấu dây tải (chân trên PCB = mặc định menuconfig)

| Tải | Mạch | ESP32-S3 | Ghi chú |
|---|---|---|---|
| Đèn | Relay_1 HF46F 12 V, kích qua transistor (mức CAO = đóng) | GPIO41 | Tiếp điểm 10 A; tải 220 V: cầu chì, khoảng cách an toàn với mạch 3,3 V |
| Quạt | Relay_2 HF46F 12 V | GPIO42 | |
| Rèm | ULN2003 IN1 / IN2 / IN3 / IN4 → 28BYJ-48 5 V | GPIO8 / GPIO18 / GPIO17 / GPIO16 | Nguồn 5 V riêng cho động cơ (≥ 300 mA), chung GND với ESP32; không có công tắc hành trình |

menuconfig:
- **Node S3: relay (đèn, quạt)** — bật/tắt, chân đèn/quạt, mức kích (mặc định CAO), khoảng cách tối thiểu giữa 2 lần đóng/cắt (500 ms).
- **Node S3: rèm cửa (ULN2003 + động cơ bước)** — bật/tắt, 4 chân, thời gian 1 nửa bước (1000 µs ≈ 4 giây/vòng), đảo chiều, hành trình mặc định khi chưa hiệu chuẩn (20480 nửa bước = 5 vòng).
- **Node S3: ứng dụng** → *Khôi phục trạng thái đèn, quạt khi có điện lại* (mặc định bật).

### Hoạt động

- **Đèn, quạt** (`node_switches`): gạt công tắc / chạm ô; lệnh từ web/app đi Server → Gateway → Node, hoặc bấm trên màn hình Gateway (Gateway gửi thẳng xuống Node, không qua Server). Mỗi lần đổi: ô trên màn hình, lưu NVS, gửi telemetry ngay (Gateway + web cập nhật trong ~1 s, kể cả khi bấm trên Node). Khởi động: relay tắt hết rồi đóng lại theo trạng thái đã lưu, cách nhau 300 ms (log `lamp restored ON`). Đổi nhanh hơn 500 ms bị từ chối (log `switching too fast`, web báo lỗi).
- **Rèm** (`node_curtain`): vị trí đếm theo nửa bước, 0 = ĐÓNG hẳn, hành trình = MỞ hẳn; lưu NVS 2 giây/lần khi đang chạy và ngay khi dừng; có điện lại thì **không tự chạy**. Trên ô: công tắc (bật = mở lại mức vừa dùng, tắt = đóng hẳn) + 2 nút **50% / 100%**; chạm phần còn lại của ô mở bảng Rèm: % mở + trạng thái, nút **DỪNG** và các nút hiệu chuẩn. Lệnh từ xa ack ngay khi bắt đầu chạy (rèm chạy lâu hơn 3 s Gateway chờ); telemetry báo **mức đích** ngay lúc bắt đầu chạy (Gateway, web đổi màu ngay) và vị trí thật khi dừng. Động cơ ngắt điện khi đứng yên (hộp số giữ trục).

### Hiệu chuẩn rèm (lần đầu lắp, hoặc khi % bị lệch)

1. Chạm ô **Rèm cửa** (ngoài công tắc và 3 nút mức) để mở bảng Rèm.
2. Giữ **Nhích ĐÓNG** tới khi rèm đóng hẳn (thả tay là dừng) → bấm **Đặt là ĐÓNG hẳn**.
3. Giữ **Nhích MỞ** tới khi rèm mở hẳn → bấm **Đặt là MỞ hẳn**. Màn hình báo hành trình (số bước, số vòng); giá trị lưu NVS và thay hành trình mặc định.
4. **Quay lại** → thử công tắc và các nút 50% / 100%.

Bấm MỞ mà rèm đóng lại: bật *Đảo chiều quay* trong menuconfig rồi hiệu chuẩn lại. Không có công tắc hành trình nên trượt bước (rèm nặng, kẹt) làm % lệch dần — chỉ lệch mốc đóng thì làm lại bước 2 là đủ.

| Hiện tượng | Kiểm |
|---|---|
| Log `relays not available` / `curtain motor not available` (LED đỏ nháy nhanh) | Chân trùng/không hợp lệ trong menuconfig |
| Relay "tách" một cái lúc cấp điện / nhấn reset | GPIO41/42 là chân JTAG, trạng thái lúc reset không xác định: thêm trở kéo xuống 10 kΩ ở cực B/G của transistor kích relay |
| Relay kêu nhưng tải không chạy | Dây tải vào tiếp điểm NO/COM, nguồn tải |
| Động cơ rung/kêu mà không quay | Thứ tự IN1..IN4 (đổi chân trong menuconfig hoặc đổi dây), nguồn 5 V yếu, tăng *Thời gian 1 nửa bước* lên 2000–3000 |
| LED trên module ULN2003 không nháy khi chạy | Chung GND, dây IN1..IN4 |
| % sai sau khi mất điện giữa chừng | Lệch tối đa ~2 giây đường chạy: hiệu chuẩn lại mốc ĐÓNG |

## LED debug (WS2812)

LED RGB WS2812 1 bóng ở **GPIO40** (`node_status_led`, task vẽ 50 ms/lần). menuconfig **Node S3: LED debug (WS2812)**: bật/tắt, chân, độ sáng (mặc định 10 %).

| Màu (ưu tiên từ trên xuống) | Ý nghĩa |
|---|---|
| Trắng chớp ngắn | Nhận lệnh từ Gateway / gửi telemetry thành công |
| Đỏ nháy nhanh (0,1 s) | Lỗi: không thấy / đọc lỗi SHT31, relay hoặc động cơ rèm không khởi tạo được — xem log |
| Tím liền | Rèm đang chạy |
| Xanh dương liền | Đang khởi động |
| Đỏ nháy chậm (1 s) | Chưa ghép nối Gateway (NVS thiếu identity / MAC Gateway / LMK) |
| Vàng nháy (0,25 s) | Đang dò kênh tìm Gateway, hoặc đã thấy Gateway nhưng chưa có giờ |
| Xanh lá liền | Đã nối Gateway, có giờ — hoạt động bình thường |

LED không sáng: nguồn LED, chiều DIN/DOUT, trở 330 Ω nối tiếp DIN. WS2812 cấp 5 V nhận tín hiệu 3,3 V của ESP32-S3 được với hầu hết LED; dây dài thì thêm IC dịch mức.

## Mic và loa (mặc định tắt)

Mic **INMP441** (I2S1 RX: SCK GPIO4, WS GPIO5 — net MIC_SW, SD GPIO6, L/R nối GND → kênh trái) và loa qua ampli **NS4168** (I2S0 TX: BCLK GPIO10, LRCLK GPIO11, SDATA GPIO9, CTRL không nối vào ESP32). Code viết sẵn (`board_audio` + `node_audio`) nhưng **mặc định TẮT**: không khởi tạo I2S, `node_audio_*` không làm gì.

Bật khi phát triển tính năng giọng nói: menuconfig **Node S3: âm thanh** → *Bật mic + loa (I2S)* (chân mặc định theo PCB, 16 kHz, âm lượng 60 %). Thêm ở **Node S3: ứng dụng**: *Bíp khi bật/tắt đèn, quạt, rèm* (bật sẵn), *[Thử mic] In mức âm (dBFS) ra log mỗi 5 giây* — dùng để kiểm mic sau khi lắp (im lặng ~ −70 dBFS, nói gần ~ −40..−20).

API cho tính năng mới (`components/application/src/node_audio.h`): `node_audio_play_pcm` (phát PCM 16 bit mono), `node_audio_read_mic` (đọc PCM đã lọc DC), `node_audio_beep`. Truyền âm thanh lên Server không đi ESP-NOW (250 byte/gói) — dùng Local AP của Gateway như Camera (IOT_NODE_NETWORK §5.2).

## Sơ đồ chân (PCB Node phòng khách)

Module **ESP32-S3-WROOM-1 N16R8**. Chân nào cũng chỉnh được trong menuconfig (mục ghi ở cột cuối), mặc định theo bảng này.

| Chân module | GPIO | Net trên PCB | Thiết bị | Ngoại vi | menuconfig "Node S3: …" |
|---|---|---|---|---|---|
| 4 | IO4 | MIC_SCK | INMP441 SCK | I2S1 | âm thanh |
| 5 | IO5 | MIC_SW | INMP441 WS | I2S1 | âm thanh |
| 6 | IO6 | MIC_SD | INMP441 SD | I2S1 | âm thanh |
| 7 | IO7 | SCL | SHT31 | I2C0 | cảm biến I2C |
| 8 | IO15 | SDA | SHT31 | I2C0 | cảm biến I2C |
| 9 | IO16 | IN4 | ULN2003 | GPIO | rèm cửa |
| 10 | IO17 | IN3 | ULN2003 | GPIO | rèm cửa |
| 11 | IO18 | IN2 | ULN2003 | GPIO | rèm cửa |
| 12 | IO8 | IN1 | ULN2003 | GPIO | rèm cửa |
| 17 | IO9 | DIN | NS4168 SDATA | I2S0 | âm thanh |
| 18 | IO10 | BCLK | NS4168 BCLK | I2S0 | âm thanh |
| 19 | IO11 | LRCLK | NS4168 LRCLK | I2S0 | âm thanh |
| 20 | IO12 | LCD_MISO | T_DO (MISO duy nhất của bus) | SPI2 | màn hình |
| 21 | IO13 | LCD_MOSI | LCD SDI + T_DIN | SPI2 | màn hình |
| 22 | IO14 | LCD_T_CS | T_CS | SPI2 | màn hình |
| 23 | IO21 | LCD_SCLK | LCD SCK + T_CLK | SPI2 | màn hình |
| 24 | IO47 | LED | Đèn nền LCD | LEDC | màn hình |
| 25 | IO48 | LCD_DC/RS | LCD DC | GPIO | màn hình |
| 31 | IO38 | LCD_CS | LCD CS | SPI2 | màn hình |
| 32 | IO39 | LCD_RESET | LCD RESET | GPIO | màn hình |
| 33 | IO40 | RGB | WS2812 DIN | RMT TX | LED debug |
| 34 | IO41 | Relay_1 | Đèn | GPIO | relay |
| 35 | IO42 | Relay_2 | Quạt | GPIO | relay |
| 38 | IO2 | IR_TX | LED IR 940 nm | RMT TX | hồng ngoại |
| 39 | IO1 | IR_RX | VS1838B | RMT RX | hồng ngoại |
| 36 / 37 | IO44 / IO43 | RXD0 / TXD0 | UART0 (ra header) | — | — |
| 27 | IO0 | GPIO0 | nút BOOT | — | — |

Không dùng: IO19/IO20 (USB native — nạp + log), IO35–37 (PSRAM Octal), IO3/IO45/IO46 (strapping, để trống). PCB **không còn GPIO trống**: cảm biến I2C mới (BH1750, AHT20…) nối chung SDA 15 / SCL 7.

Ngoại vi đã dùng: RMT TX 3/4 khối (LED IR 2 khối, WS2812 1 khối), RMT RX 1 kênh + DMA (VS1838B), I2S0 + I2S1 (khi bật âm thanh), SPI2, I2C0, LEDC timer 0 kênh 0, esp_timer (tick LVGL 2 ms, nhịp động cơ bước).

## Ghi chú phần cứng

| Thiết bị | Lưu ý |
|---|---|
| HF46F 12 V | Cuộn ~30 mA lấy từ nguồn 12 V, kích qua transistor (GPIO mức cao = đóng) + diode dập song song cuộn + điện trở kéo xuống ở cực B/G. Tải 220 V: cầu chì, khoảng cách an toàn giữa đường 220 V và mạch 3,3 V |
| ULN2003 + 28BYJ-48 5 V | Nguồn 5 V riêng ≥ 300 mA (nửa bước có lúc 2 cuộn cùng cấp điện, ~240 mA), chung GND với ESP32. Không có công tắc hành trình: vị trí là số bước đếm |
| WS2812 | Trở 330 Ω nối tiếp DIN, tụ 100 nF–10 µF ở chân nguồn LED |
| LED IR 940 nm | Xung ~100 mA để phát xa: kích qua transistor, điện trở hạn dòng theo nguồn (VD 5 V → 22–47 Ω) |
| VS1838B | Cấp **3,3 V** (cấp 5 V thì ngõ ra lên 5 V, quá áp chân S3). RC 100 Ω + 4,7 µF ở chân nguồn |
| INMP441 | 3,3 V; L/R nối GND → kênh trái (mặc định driver) |
| NS4168 | Cấp 5 V; chân CTRL chọn tắt/kênh theo mức điện áp (datasheet). CTRL không nối ESP32 thì ampli luôn bật — lúc im lặng firmware gửi mẫu 0 |
| ILI9488 + XPT2046 | Không nối SDO của LCD vào bus; MISO chỉ nối T_DO. Đèn nền 60–100 mA: module thường có sẵn transistor ở chân LED, nếu không thì tự kích qua transistor |
| I2C | Trở kéo lên 4,7 kΩ (module cảm biến thường có sẵn — nhiều module cùng bus thì trở song song, kiểm lại) |

## Thêm thiết bị

1. Chân + khởi tạo driver vào `components/board/` (`Kconfig.projbuild` + `board_*.c`) — chỗ **duy nhất** có số chân; application không include driver.
2. Logic vào một module riêng trong `components/application/` như `node_switches`: task + hàng đợi, nhận lệnh từ `on_cmd` của `node_app.c` theo `params.target` (ack ≤ 3 s), đẩy trạng thái lên `node_ui`, cờ `*_take_changed` để `report_tick` gửi telemetry ngay.
3. Trường telemetry mới: thêm vào `add_*` trong `node_app.c` — kiểm tổng gói ≤ 246 byte (gói thường hiện ~230 byte với `device_id` 14 ký tự; thiếu chỗ thì tách gói như `ac_codes`).
4. Điều khiển tại chỗ: callback từ `ui` lên application (`node_ui_set_*_callbacks`), `ui` không gọi thẳng driver. Mọi lời gọi `lv_*` ngoài task LVGL phải nằm giữa `drv_display_lock(-1)` / `drv_display_unlock()`.

## LVGL

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

Sau khi kéo code có menu mới (relay, rèm, LED, âm thanh — 2026-11-13) mà đã có `sdkconfig` cũ: chạy `idf.py reconfigure build` để các tuỳ chọn mới vào `sdkconfig` với giá trị mặc định theo PCB (kiểm lại: `findstr NODE_RELAY sdkconfig`).

Đổi tuỳ chọn không bí mật: `idf.py menuconfig` → các menu *Node S3: …* (màn hình, cảm biến I2C, hồng ngoại, relay, rèm cửa, LED debug, âm thanh, services, ứng dụng); LVGL ở *Component config → LVGL configuration*.

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
- Node: chấm góc phải màn hình vàng (đang tìm Gateway) → xanh (đã nối), ngày giờ hiện ra khi có giờ từ Gateway. Log: `node_link: gateway ... found on channel N`, `node_time: ... gateway`, `node_app: telemetry sent to gateway`.
- Gateway: log `gw_espnow: TELEMETRY node-living-01 verified`; trang **Living Room** hiện nhiệt độ/độ ẩm, trang **Thiết bị** có node chấm xanh.

| Hiện tượng (node) | Kiểm |
|---|---|
| "Chưa ghép nối Gateway" (đỏ) | Log `node not provisioned` / `ESP-NOW not started`: chưa nạp NVS hoặc thiếu `gateway_mac`/`session_key` |
| "Đang tìm Gateway..." mãi | Gateway chưa bật / chưa có node này trong `nodes`; `gateway_mac` phải là MAC **Station** (không phải AP) |
| Log `gateway acks at MAC level but sends no TIME_SYNC` | LMK hai phía khác nhau, hoặc Gateway chưa có giờ (chưa vào mạng/NTP) |
| Gateway log `drop TELEMETRY ... sensor_id does not match` / `bad signature` | `device_id`/secret hai phía khác nhau |

## Hợp đồng lệnh và telemetry

Server gửi lệnh tới UID `<node_id>-<target>` (topic `home/<home_id>/gateway/<gw>/device/<uid>/command`, [API_DESIGN](../../docs/API_DESIGN.md) §10); Gateway chuyển xuống Node bằng ESP-NOW `CMD {command_id, action, params: {target}, ts}` và chờ `CMD_ACK` tối đa 3 s (học mã IR: 14 s).

| `target` | `action` | Ack |
|---|---|---|
| `lamp`, `fan` | `turn_on`, `turn_off`, `toggle` | Sau khi đóng/cắt relay, `power` = trạng thái mới. Lỗi nếu đổi nhanh hơn 500 ms |
| `curtain` | `turn_on` (mở hẳn), `turn_off` (đóng hẳn), `toggle`, `stop`, `set_pos_<0..100>` | **Ngay khi bắt đầu chạy**, `power` = đích > 0 (mở). Lỗi khi đang hiệu chuẩn trên màn hình |
| `ac` | `turn_on`, `turn_off`, `set_temp_<16..30>`, `learn_off`, `learn_t<16..30>` | Sau khi phát / học xong ([Học mã IR điều hòa](../../docs/guides/HOC_MA_IR_DIEU_HOA.md)) |

Backend hiện gửi `turn_on`/`turn_off` (cộng `set_temp_*`, `learn_*` cho điều hòa); `toggle`, `stop`, `set_pos_*` Node nhận sẵn cho tính năng sau. Lệnh không có `target`, `target` lạ, hoặc tải tắt trong menuconfig → ack lỗi ngay.

TELEMETRY (`data` của `sensor_payload`, ký HMAC lớp 1):

| Khoá | Giá trị | Có mặt khi |
|---|---|---|
| `temperature`, `humidity` | °C, %RH (1 số lẻ) | SHT31 đọc được trong 6 giây gần nhất |
| `ac`, `ac_temp` | 0/1, 16..30 | Đã phát mã IR từ lúc khởi động (trước đó chưa biết điều hòa đang ra sao) |
| `lamp`, `fan` | 0/1 | Relay bật trong menuconfig |
| `curtain` | 0 = đóng hẳn, 2..100 = % mở | Rèm bật trong menuconfig (1 % làm tròn lên 2 vì Gateway hiểu 1 là "mở"). Đang chạy: gửi **mức đích** (gửi ngay khi nhận lệnh, để Gateway/web đổi trạng thái không chờ rèm chạy xong; không gửi vị trí giữa chừng nên web không nhảy mở/đóng qua lại); dừng xong gửi ngay vị trí thật |
| `ac_codes` | bitmask 0..65535 mã IR đã học | **Gói riêng** (số đo + `ac`, `ac_temp`, `ac_codes`; không có `lamp/fan/curtain`): khi đổi, ngay sau khi nối Gateway, rồi 10 phút/lần |

Gói thường ~230 byte với `device_id` 14 ký tự (giới hạn 246 byte/khung ESP-NOW) — **`device_id` của Node phải ≤ 30 ký tự**, dài hơn thì gói bị từ chối (log `telemetry exceeds one ESP-NOW frame`) và cả 4 thiết bị con thành offline trên Server. Gửi mỗi `CONFIG_NODE_APP_TELEMETRY_INTERVAL_S` (10 s) và **ngay khi tải đổi trạng thái** (kể cả bấm trên màn hình Node). Gateway chỉ cập nhật trường có mặt; Backend (`telemetry/domain/ingest-common.ts`, chung đường MQTT và HTTP) đồng bộ `power_state` của `<node>-lamp|fan|curtain|ac` (rèm: mở = bật) và tính online của chúng theo gói này.

Còn mở:
- Gateway đã gửi `ts` trong mọi `CMD`: có thể bật `CONFIG_NODE_CMD_REQUIRE_TS` (menuconfig *Node S3: services*) để từ chối lệnh không có `ts`.
- Web có 3 nút rèm Đóng / 50% / 100% (`set_pos_<N>`, backend lưu `devices.curtain_pos`); app Mobile vẫn chỉ Mở/Đóng.

## Chạy thử trên mạch (sau khi nạp)

1. `idf.py reconfigure build`, rồi `idf.py -p COM8 flash monitor`. Không cần nạp lại NVS (namespace `loads` tự tạo).
2. Log khởi động có: `drv_ws2812: 1 LED(s) on GPIO 40`, `board_loads: relays: lamp GPIO 41, fan GPIO 42 (active high)`, `drv_stepper: ULN2003 on GPIO 8/18/17/16, 1000 us per half-step`, `node_curtain: curtain at 0% (...)`, `node_app: mic/speaker disabled in menuconfig`. LED: xanh dương → vàng nháy → xanh lá.
3. Cấp điện / nhấn reset: relay không "tách".
4. Gạt công tắc **Đèn**: relay đóng, ô chuyển nền xanh, log `node_cmd: [2] lamp -> ON (relay switched)   [screen]`, trang Living Room của Gateway đổi theo trong ~1 s. Tương tự **Quạt**.
5. Bật đèn → rút điện → cắm lại: đèn sáng lại, log `lamp restored ON`.
6. Rèm: hiệu chuẩn (mục trên) → công tắc, 50% / 100%, DỪNG trên bảng Rèm; LED tím khi chạy. Rút điện khi đang chạy → cắm lại → % gần đúng chỗ dừng.
7. Từ web (backend đã chạy migration `set_node_appliances_real_2026_11`): bật/tắt Đèn, Quạt, rèm Đóng / 50% / 100% → Node chạy, web báo thành công, LED chớp trắng, log hiện đủ 4 dòng `node_cmd` (mục [Theo dõi lệnh trên terminal](#theo-dõi-lệnh-trên-terminal)). Bấm trên Node → web tự cập nhật.

## Theo dõi lệnh trên terminal

Mọi bước của một lệnh in ra dưới **một tag riêng `node_cmd`**, lọc được khi monitor để chỉ còn vết lệnh (cộng mọi cảnh báo/lỗi của các phần khác):

```
idf.py -p COM8 monitor --print-filter="*:W node_cmd:I"
```

Bỏ `--print-filter` thì thấy toàn bộ log như cũ. Bấm một nút trên web, terminal hiện 4 bước:

```
I (51234) node_cmd: [1] recv from server: target=lamp action=turn_on   (cmd 3f2a9c1e-...)
I (51236) node_cmd: [2] lamp -> ON (relay switched)   [remote]
I (51241) node_cmd: [3] ack OK power=ON -> gateway, 7 ms after receive   (cmd 3f2a9c1e-...)
I (51420) node_cmd: [4] state -> gateway: temperature=28.4 humidity=61.0 lamp=1 fan=0 curtain=0
```

| Bước | In ở | Ý nghĩa |
|---|---|---|
| `[1] recv from server` / `recv from gateway screen` | `node_app` (`on_cmd`) | Lệnh đã tới Node, kèm `target`, `action`, `command_id`. `server` = từ web/app (Server → Gateway → ESP-NOW, id là UUID, trùng với backend / log Gateway); `gateway screen` = bấm trên màn hình Gateway (id `gw-…`, Server không có bản ghi lệnh này) |
| `[2] …` | `node_switches`, `node_curtain`, `node_ac` | Node làm gì: đóng/cắt relay, rèm chạy từ % nào tới % nào, phát mã IR. Đuôi `[remote]` = lệnh đến qua ESP-NOW (web/app hoặc màn hình Gateway), `[screen]` = bấm trên màn hình Node (không có bước 1 và 3). Rèm in thêm `[2] curtain stopped at N%` khi dừng |
| `[3] ack …` | `node_link` | Kết quả gửi lại Gateway: `OK`/`ERROR`, `power`, số ms từ lúc nhận lệnh. Dòng cảnh báo `NOT delivered to gateway` = Node làm xong nhưng Gateway không nhận ack → web sẽ báo hết giờ |
| `[4] state -> gateway` | `node_app` (task report) | Gói TELEMETRY báo trạng thái mới (web và màn hình Gateway cập nhật theo gói này). Rèm: bước 4 chỉ có sau khi rèm dừng |

Dòng màu vàng (W) của `node_cmd` cho biết vì sao lệnh không chạy:

| Log | Nguyên nhân |
|---|---|
| `[2] target=… NOT accepted` | `target` lạ, tải tắt trong menuconfig, hoặc hàng đợi đầy |
| `[2] lamp -> ON REFUSED: switching too fast` | Bấm lại trong vòng 0,5 giây |
| `[2] … DROPPED: waited too long in queue` | Lệnh xếp hàng quá 2,5 giây (VD sau lúc học mã IR) — Gateway đã báo hết giờ nên Node bỏ |
| `[2] curtain … REJECTED: curtain is being calibrated on the screen` | Đang giữ nút nhích ở màn Hiệu chuẩn |
| `[2] ac … FAILED: IR code not learned yet or IR send error` | Chưa học mã cho mức nhiệt đó |
| `node_link: duplicate CMD …` | Gateway gửi lại cùng `command_id`: Node không làm lại, chỉ gửi lại ack cũ |

Bấm trên web mà **không có dòng `[1]`**: lệnh chưa tới Node — xem log Gateway (`command … → …, waiting CMD_ACK` hoặc `unreachable over ESP-NOW`), góc phải màn hình Node (phải "Đã nối Gateway") và trạng thái online của thiết bị trên web.
