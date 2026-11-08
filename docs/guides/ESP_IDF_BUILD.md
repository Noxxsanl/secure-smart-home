# ESP_IDF_BUILD.md

> **Hướng dẫn ESP-IDF: tạo project, cấu hình, build, nạp firmware**
> Dùng cho các project firmware mới của bộ phần cứng demo: Gateway Waveshare ESP32-S3-Touch-LCD-4.3B-BOX, Camera ESP32-CAM, Node phòng khách ([IOT_NODE_NETWORK](../firmware/IOT_NODE_NETWORK.md) §8).
> Kiến trúc firmware đích (component, task, partition, NVS) nằm ở [Firmware](../firmware/EMBEDDED_ARCHITECTURE_ESP_IDF.md). Tài liệu này chỉ nói **lệnh và cách làm**, không lặp lại thiết kế.

| | |
|---|---|
| **Hiện trạng repo** | Firmware đang chạy thật (`firmware/gateway-node`, `firmware/sensor-node`) vẫn là **PlatformIO + Arduino**, build bằng `pio run`. Chưa có project ESP-IDF nào của dự án. Chỉ có ví dụ ESP-IDF của Waveshare ở `firmware/ESP32-S3-Touch-LCD-4.3B-BOX-Demo/ESP-IDF/` (01–08) |
| **Phiên bản trên máy dev** | ESP-IDF **v5.4.4**, cài bằng ESP-IDF Windows Installer vào `C:\Espressif`, Python 3.11 (`C:\Espressif\python_env\idf5.4_py3.11_env`) |
| **Đã kiểm tra trên máy dev** | Chỉ bước mở môi trường (mục 1.2). Các lệnh tạo project/build/flash viết theo tài liệu ESP-IDF v5.4, chưa chạy với project của dự án |
| **Ngày viết** | 2026-11-07 |

---

## MỤC LỤC

1. [Chuẩn bị môi trường](#1-chuẩn-bị-môi-trường)
2. [Tạo project](#2-tạo-project)
3. [Chọn chip và cấu hình](#3-chọn-chip-và-cấu-hình)
4. [Bảng phân vùng flash](#4-bảng-phân-vùng-flash)
5. [Build](#5-build)
6. [Nạp firmware và xem log](#6-nạp-firmware-và-xem-log)
7. [Credential và chứng chỉ — không đưa vào git](#7-credential-và-chứng-chỉ--không-đưa-vào-git)
8. [Build bằng PlatformIO và CI](#8-build-bằng-platformio-và-ci)
9. [Xử lý sự cố](#9-xử-lý-sự-cố)
10. [Bảng lệnh nhanh](#10-bảng-lệnh-nhanh)

---

## 1. Chuẩn bị môi trường

### 1.1. Cài đặt (máy mới)

| Hệ điều hành | Cách cài |
|---|---|
| Windows | ESP-IDF Windows Installer (bản *Offline* hoặc *Online*), chọn **v5.4.x**, thư mục mặc định `C:\Espressif`. Installer cài sẵn Python, Git, CMake, Ninja, toolchain Xtensa/RISC-V |
| Linux / macOS | `git clone -b v5.4.4 --recursive https://github.com/espressif/esp-idf.git ~/esp/esp-idf` rồi `cd ~/esp/esp-idf && ./install.sh esp32,esp32s3` |
| VS Code | Extension *ESP-IDF* (Espressif) — có thể trỏ tới bản đã cài ở `C:\Espressif`, không cần cài lại |

Cả nhóm nên dùng **cùng một bản ESP-IDF (v5.4.4)** để build tái lập. Ví dụ Waveshare yêu cầu `idf >= 5.1.0` (`08_lvgl_Porting/main/idf_component.yml`), nên v5.4 dùng được.

### 1.2. Mở terminal có môi trường ESP-IDF

Mỗi terminal mới phải nạp môi trường trước khi gõ `idf.py`.

| Shell | Lệnh |
|---|---|
| **PowerShell** (khuyến nghị trên Windows) | Mở shortcut **"ESP-IDF 5.4 PowerShell"** trong Start Menu, hoặc gõ:<br>`& C:\Espressif\Initialize-Idf.ps1 -IdfId esp-idf-357f6559377bff137a34a2228e74577b` |
| cmd | Shortcut **"ESP-IDF 5.4 CMD"**, hoặc `C:\Espressif\idf_cmd_init.bat esp-idf-357f6559377bff137a34a2228e74577b` |
| Linux / macOS | `. ~/esp/esp-idf/export.sh` |

`IdfId` lấy trong `C:\Espressif\esp_idf.json` (khoá `idfSelectedId`). Mỗi máy một giá trị, máy khác thì đọc lại file này.

> **Lưu ý trên Windows:** đừng chạy thẳng `C:\Espressif\frameworks\esp-idf-v5.4.4\export.ps1` từ PowerShell thường. Nếu máy có Python khác (VD 3.14), script sẽ dùng Python đó và tìm venv ở `%USERPROFILE%\.espressif\...`, rồi báo `ESP-IDF Python virtual environment ... not found`. `Initialize-Idf.ps1` tự đặt `IDF_TOOLS_PATH=C:\Espressif` và chọn đúng Python 3.11 của bộ cài.
>
> **Git Bash không được hỗ trợ** (ESP-IDF từ chối MSYS/MinGW). Trên Windows dùng PowerShell hoặc cmd.

Kiểm tra:

```powershell
python --version          # Python 3.11.x (của bộ cài, không phải Python hệ thống)
echo $env:IDF_PATH        # C:\Espressif\frameworks\esp-idf-v5.4.4
idf.py --help             # in danh sách lệnh là môi trường đã sẵn sàng
```

---

## 2. Tạo project

Mục 2.1 là lệnh chung. Mục 2.2 (Gateway ESP32-S3-N16R8) và 2.3 (ESP32-CAM) là các bước đầy đủ cho từng board, từ thư mục trống tới khi nạp xong và đọc được log.

### 2.1. Lệnh chung

```powershell
cd E:\WorkSpace\secure-smart-home-iot\firmware

idf.py create-project --path <thư_mục> <tên_project>   # tạo vào thư mục rỗng hoặc chưa có
idf.py create-project <tên_project>                    # tạo thư mục con mới trùng tên project
```

Tên project chỉ dùng chữ thường, số, gạch dưới. Tên này thành tên file `<tên>.bin` và `main/<tên>.c`.

Kết quả (VD `--path camera camera`):

```
camera/
├── CMakeLists.txt        # file gốc của project
└── main/
    ├── CMakeLists.txt    # đăng ký component "main"
    └── camera.c          # app_main()
```

`CMakeLists.txt` gốc chỉ cần 3 dòng, đúng thứ tự:

```cmake
cmake_minimum_required(VERSION 3.16)
include($ENV{IDF_PATH}/tools/cmake/project.cmake)
project(camera)
```

`main/CMakeLists.txt`:

```cmake
idf_component_register(SRCS "camera.c"
                       INCLUDE_DIRS ".")
```

**Thứ tự cho mọi board:** tạo project → viết `sdkconfig.defaults` và bảng phân vùng → `set-target` → thêm thư viện → viết code → build, nạp. Viết `sdkconfig.defaults` **trước** `set-target`, vì `set-target` sinh `sdkconfig` từ file đó.

Thư mục dự kiến cho từng thiết bị ([IOT_NODE_NETWORK](../firmware/IOT_NODE_NETWORK.md) §8):

| Thiết bị | Thư mục | Target | Hướng dẫn |
|---|---|---|---|
| Gateway (ESP32-S3-N16R8) | `firmware/gateway-s3` (mới) | `esp32s3` | Mục 2.2 |
| Camera cửa (ESP32-CAM) | `firmware/camera` (đang rỗng) | `esp32` | Mục 2.3 |
| Node phòng khách | `firmware/LivingRoom` (đang rỗng) | Theo chip của mạch (chưa chốt, §4.3) | Làm như 2.3, đổi target |

> Không tạo project ESP-IDF đè lên `firmware/gateway-node`: đó là project PlatformIO đang chạy và đang được CI build. Làm Gateway mới ở `firmware/gateway-s3`, đến khi đạt bước 1 của lộ trình ([IOT_NODE_NETWORK](../firmware/IOT_NODE_NETWORK.md) §9) thì mới thay thế.

### 2.2. Gateway — ESP32-S3-N16R8 (Waveshare ESP32-S3-Touch-LCD-4.3B-BOX)

**Thông số cần đúng khi cấu hình** (N16R8 = flash 16 MB, PSRAM 8 MB):

| Hạng mục | Giá trị | Ảnh hưởng tới cấu hình |
|---|---|---|
| SoC | ESP32-S3, 2 nhân LX7, 240 MHz | `set-target esp32s3` |
| Flash | 16 MB, QIO 80 MHz | `CONFIG_ESPTOOLPY_FLASHSIZE_16MB` |
| PSRAM | 8 MB, **Octal** (OPI) | `CONFIG_SPIRAM_MODE_OCT`. Để mặc định Quad thì board không khởi động được PSRAM |
| Cổng nạp/log | USB-C nối USB Serial/JTAG trong chip (GPIO19/20) | `CONFIG_ESP_CONSOLE_USB_SERIAL_JTAG` |
| I2C chung | SDA GPIO8, SCL GPIO9 (CH422G, cảm ứng GT911) | Theo ví dụ Waveshare |
| LCD RGB 800×480 | Dùng phần lớn GPIO còn lại | Danh sách chân ở `08_lvgl_Porting/main/waveshare_rgb_lcd_port.h`; kiểm trước khi gán chân cho việc khác |

**Bước 1 — Tạo project**

```powershell
cd E:\WorkSpace\secure-smart-home-iot\firmware
idf.py create-project --path gateway-s3 gateway
cd gateway-s3
```

**Bước 2 — Tạo `sdkconfig.defaults`** (cùng cấp `CMakeLists.txt` gốc). Lấy theo cấu hình của ví dụ Waveshare (`05_IO_Test`, `08_lvgl_Porting`), thêm bảng phân vùng và rollback:

```ini
# sdkconfig.defaults — Gateway ESP32-S3-N16R8
CONFIG_IDF_TARGET="esp32s3"
CONFIG_ESP_DEFAULT_CPU_FREQ_MHZ_240=y

# Flash 16 MB
CONFIG_ESPTOOLPY_FLASHMODE_QIO=y
CONFIG_ESPTOOLPY_FLASHFREQ_80M=y
CONFIG_ESPTOOLPY_FLASHSIZE_16MB=y

# PSRAM 8 MB Octal
CONFIG_SPIRAM=y
CONFIG_SPIRAM_MODE_OCT=y
CONFIG_IDF_EXPERIMENTAL_FEATURES=y
CONFIG_SPIRAM_SPEED_80M=y
# Giữ ảnh LCD RGB không trôi khi ghi flash (OTA, NVS) — IOT_NODE_NETWORK §3
CONFIG_SPIRAM_FETCH_INSTRUCTIONS=y
CONFIG_SPIRAM_RODATA=y

# Log qua cổng USB-C
CONFIG_ESP_CONSOLE_USB_SERIAL_JTAG=y

# Bảng phân vùng riêng (mục 4)
CONFIG_PARTITION_TABLE_CUSTOM=y
CONFIG_PARTITION_TABLE_CUSTOM_FILENAME="partitions_gateway.csv"

# OTA: tự rollback nếu app mới không xác nhận boot thành công (Firmware §14)
CONFIG_BOOTLOADER_APP_ROLLBACK_ENABLE=y
```

**Bước 3 — Tạo `partitions_gateway.csv`** cùng cấp, nội dung lấy ở mục 4.

**Bước 4 — Chọn chip**

```powershell
idf.py set-target esp32s3
```

**Bước 5 — Viết code kiểm board** — thay nội dung `main/gateway.c`:

```c
#include <inttypes.h>
#include "esp_chip_info.h"
#include "esp_flash.h"
#include "esp_psram.h"
#include "esp_log.h"

static const char *TAG = "gateway";

void app_main(void)
{
    esp_chip_info_t chip;
    esp_chip_info(&chip);

    uint32_t flash_bytes = 0;
    esp_flash_get_size(NULL, &flash_bytes);

    ESP_LOGI(TAG, "%s, %d cores, rev v%d.%d", CONFIG_IDF_TARGET,
             chip.cores, chip.revision / 100, chip.revision % 100);
    ESP_LOGI(TAG, "flash %" PRIu32 " MB, psram %u MB",
             flash_bytes / (1024 * 1024),
             (unsigned)(esp_psram_get_size() / (1024 * 1024)));
}
```

**Bước 6 — Build, nạp, xem log** (cắm cáp vào cổng USB-C của board; tìm cổng COM ở mục 6.1):

```powershell
idf.py build
idf.py -p COM5 flash monitor
```

Log đúng (số revision tuỳ lô chip):

```
I (...) gateway: esp32s3, 2 cores, rev v0.2
I (...) gateway: flash 16 MB, psram 8 MB
```

Không nạp được thì giữ **BOOT**, nhấn **RESET**, nhả BOOT rồi nạp lại. Nếu boot báo lỗi PSRAM hoặc in `psram 0 MB`, kiểm lại `CONFIG_SPIRAM_MODE_OCT` ở bước 2 (xoá `sdkconfig` rồi build lại, mục 3.2).

**Bước 7 — Thêm màn hình và cảm ứng (khi cần LCD).** Dùng lại phần driver của ví dụ `08_lvgl_Porting`. Thư viện lấy qua registry, không chép thư mục `components/` của ví dụ:

```powershell
idf.py add-dependency "lvgl/lvgl>8.3.9,<9"
idf.py add-dependency "espressif/esp_lcd_touch_gt911^1"

$demo = "..\ESP32-S3-Touch-LCD-4.3B-BOX-Demo\ESP-IDF\08_lvgl_Porting\main"
Copy-Item "$demo\waveshare_rgb_lcd_port.c", "$demo\waveshare_rgb_lcd_port.h", `
          "$demo\lvgl_port.c", "$demo\lvgl_port.h", "$demo\Kconfig.projbuild" .\main\
```

`main/CMakeLists.txt`:

```cmake
idf_component_register(SRCS "gateway.c" "waveshare_rgb_lcd_port.c" "lvgl_port.c"
                       INCLUDE_DIRS ".")

# LVGL 8 sinh cảnh báo format khi build với ESP-IDF 5 — tắt riêng cho thư viện này (như ví dụ Waveshare)
idf_component_get_property(lvgl_lib lvgl__lvgl COMPONENT_LIB)
target_compile_options(${lvgl_lib} PRIVATE -Wno-format)
```

Thêm vào cuối `sdkconfig.defaults` (lấy từ `08_lvgl_Porting/sdkconfig.defaults`, bỏ phần demo):

```ini
CONFIG_FREERTOS_HZ=1000
CONFIG_ESP32S3_DATA_CACHE_LINE_64B=y
CONFIG_EXAMPLE_LVGL_PORT_TASK_CORE=1
CONFIG_EXAMPLE_LVGL_PORT_AVOID_TEAR_ENABLE=y
CONFIG_LV_COLOR_SCREEN_TRANSP=y
CONFIG_LV_MEM_CUSTOM=y
CONFIG_LV_MEMCPY_MEMSET_STD=y
CONFIG_LV_ATTRIBUTE_FAST_MEM_USE_IRAM=y
CONFIG_LV_FONT_MONTSERRAT_16=y
CONFIG_LV_FONT_MONTSERRAT_20=y
```

Trong `app_main()` gọi `waveshare_esp32_s3_rgb_lcd_init()` trước, rồi mới tạo giao diện bên trong cặp `lvgl_port_lock(-1)` / `lvgl_port_unlock()` (LVGL không an toàn đa luồng). Xem `08_lvgl_Porting/main/main.c`. Sửa `sdkconfig.defaults` xong thì xoá `sdkconfig` rồi build lại.

### 2.3. Camera cửa — ESP32-CAM (AI-Thinker)

**Thông số** (module AI-Thinker giả định ở [IOT_NODE_NETWORK](../firmware/IOT_NODE_NETWORK.md) §4.2 — cần đối chiếu với module thật):

| Hạng mục | Giá trị | Ghi chú |
|---|---|---|
| SoC | ESP32, 2 nhân, 240 MHz | `set-target esp32` |
| Flash | 4 MB | `CONFIG_ESPTOOLPY_FLASHSIZE_4MB` |
| PSRAM | 4 MB, nối qua GPIO16/17 | Bắt buộc bật để chứa khung hình. Không dùng GPIO16/17 cho việc khác |
| Cảm biến ảnh | OV2640, xuất JPEG | Component `espressif/esp32-camera` |
| Cổng nạp | Không có USB trên module | Cần đế ESP32-CAM-MB hoặc USB-TTL |
| Chân còn trống | GPIO 2, 4 (đèn flash), 12, 13, 14, 15 — dùng chung với khe thẻ nhớ | PIR dự kiến ở GPIO13 (IOT_NODE_NETWORK Q2). **GPIO12** là chân strapping điện áp flash: không để mức cao lúc khởi động |

**Bước 1 — Tạo project** (`firmware/camera` đang rỗng):

```powershell
cd E:\WorkSpace\secure-smart-home-iot\firmware
idf.py create-project --path camera camera
cd camera
```

**Bước 2 — Tạo `sdkconfig.defaults`**:

```ini
# sdkconfig.defaults — ESP32-CAM AI-Thinker
CONFIG_IDF_TARGET="esp32"
CONFIG_ESP_DEFAULT_CPU_FREQ_MHZ_240=y
CONFIG_ESPTOOLPY_FLASHSIZE_4MB=y

# PSRAM chứa khung hình JPEG
CONFIG_SPIRAM=y

# Bảng phân vùng riêng (mục 4)
CONFIG_PARTITION_TABLE_CUSTOM=y
CONFIG_PARTITION_TABLE_CUSTOM_FILENAME="partitions_node.csv"

CONFIG_BOOTLOADER_APP_ROLLBACK_ENABLE=y
```

Không tắt brownout detector để chữa lỗi reset (firmware Arduino cũ làm vậy qua `soc/rtc_cntl_reg.h`). Reset do sụt áp thì sửa nguồn (mục 9).

**Bước 3 — Tạo `partitions_node.csv`** cùng cấp, nội dung lấy ở mục 4.

**Bước 4 — Chọn chip và thêm thư viện camera**

```powershell
idf.py set-target esp32
idf.py add-dependency "espressif/esp32-camera^2.0.0"
```

**Bước 5 — Viết code chụp thử** — thay nội dung `main/camera.c`:

```c
#include "esp_camera.h"
#include "esp_log.h"

static const char *TAG = "camera";

/* Sơ đồ chân ESP32-CAM AI-Thinker */
static const camera_config_t cam_cfg = {
    .pin_pwdn = 32, .pin_reset = -1, .pin_xclk = 0,
    .pin_sccb_sda = 26, .pin_sccb_scl = 27,
    .pin_d7 = 35, .pin_d6 = 34, .pin_d5 = 39, .pin_d4 = 36,
    .pin_d3 = 21, .pin_d2 = 19, .pin_d1 = 18, .pin_d0 = 5,
    .pin_vsync = 25, .pin_href = 23, .pin_pclk = 22,

    .xclk_freq_hz = 20000000,
    .ledc_timer = LEDC_TIMER_0,
    .ledc_channel = LEDC_CHANNEL_0,

    .pixel_format = PIXFORMAT_JPEG,
    .frame_size = FRAMESIZE_SVGA,      /* 800x600 — IOT_NODE_NETWORK §4.2 */
    .jpeg_quality = 12,
    .fb_count = 2,
    .fb_location = CAMERA_FB_IN_PSRAM,
    .grab_mode = CAMERA_GRAB_LATEST,
};

void app_main(void)
{
    esp_err_t err = esp_camera_init(&cam_cfg);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "camera init failed: %s", esp_err_to_name(err));
        return;
    }

    camera_fb_t *fb = esp_camera_fb_get();
    if (fb == NULL) {
        ESP_LOGE(TAG, "capture failed");
        return;
    }
    ESP_LOGI(TAG, "frame %ux%u, %u bytes",
             (unsigned)fb->width, (unsigned)fb->height, (unsigned)fb->len);
    esp_camera_fb_return(fb);
}
```

**Bước 6 — Nối dây để nạp**

| Cách | Nối | Vào chế độ nạp |
|---|---|---|
| Đế ESP32-CAM-MB (khuyến nghị) | Cắm module lên đế, cắm USB vào đế | Thường tự vào. Nếu báo `Failed to connect`: giữ nút **IO0** trên đế, nhấn **RST**, nhả IO0 |
| USB-TTL | 5V→5V, GND→GND, TX của USB-TTL→U0R (GPIO3), RX→U0T (GPIO1) | Nối **GPIO0 xuống GND**, nhấn RST rồi nạp. Nạp xong gỡ GPIO0 khỏi GND, nhấn RST để chạy |

**Bước 7 — Build, nạp, xem log**

```powershell
idf.py build
idf.py -p COM6 flash monitor
```

Log đúng (dung lượng ảnh thay đổi theo khung cảnh, khoảng 20–60 KB):

```
I (...) camera: frame 800x600, 34567 bytes
```

Nếu báo `Camera probe failed with error 0x105` thì cáp camera lỏng hoặc sơ đồ chân sai. Nếu reset liên tục kèm `Brownout detector was triggered` thì nguồn yếu (mục 9).

### 2.4. Bắt đầu từ ví dụ có sẵn

Muốn thử nhanh một chức năng (WiFi, MQTT TLS, ESP-NOW, LCD) trước khi đưa vào project chính thì chép ví dụ rồi sửa:

```powershell
# Ví dụ đi kèm ESP-IDF
Copy-Item -Recurse $env:IDF_PATH\examples\wifi\getting_started\station  .\gw-wifi-test
Copy-Item -Recurse $env:IDF_PATH\examples\protocols\mqtt\ssl             .\gw-mqtt-tls-test
Copy-Item -Recurse $env:IDF_PATH\examples\wifi\espnow                    .\espnow-test

# Ví dụ của Waveshare cho board Gateway (LCD, cảm ứng, LVGL)
Copy-Item -Recurse .\ESP32-S3-Touch-LCD-4.3B-BOX-Demo\ESP-IDF\08_lvgl_Porting .\gw-lcd-test

# Ví dụ nằm trong component trên ESP Component Registry (tải về máy)
idf.py create-project-from-example "espressif/esp32-camera:camera_example"
```

Chép xong nhớ xoá `build/`, `sdkconfig` của bản gốc nếu có. Tên ví dụ trong lệnh `create-project-from-example` xem ở trang component trên <https://components.espressif.com> (mục *Examples*).

### 2.5. Thêm component tự viết

Theo cấu trúc ở [Firmware](../firmware/EMBEDDED_ARCHITECTURE_ESP_IDF.md) §5, logic dùng chung nằm trong `components/`:

```powershell
cd firmware\camera
idf.py -C components create-component security_manager
```

Tạo ra `components/security_manager/{CMakeLists.txt, include/security_manager.h, security_manager.c}`. Component nào dùng thì khai báo phụ thuộc:

```cmake
# main/CMakeLists.txt
idf_component_register(SRCS "camera.c"
                       INCLUDE_DIRS "."
                       REQUIRES security_manager esp_wifi nvs_flash)
```

Mã dùng chung cho cả ba project (HMAC, khung tin ESP-NOW) dự kiến đặt ở `firmware/common/` ([IOT_NODE_NETWORK](../firmware/IOT_NODE_NETWORK.md) §8). Project trỏ tới bằng `EXTRA_COMPONENT_DIRS`, đặt **trước** dòng `include(...)`:

```cmake
cmake_minimum_required(VERSION 3.16)
set(EXTRA_COMPONENT_DIRS ../common)
include($ENV{IDF_PATH}/tools/cmake/project.cmake)
project(camera)
```

> HMAC phải đúng một bản dùng chung: `HMAC-SHA256(secret, "<device_id>:<unix_ts>")`, hex chữ thường, phải khớp backend ↔ gateway ↔ sensor. Không chép hàm HMAC vào từng project.

### 2.6. Thêm thư viện từ ESP Component Registry

```powershell
idf.py add-dependency "espressif/esp32-camera^2.0.0"     # Camera
idf.py add-dependency "espressif/esp_new_jpeg"           # Gateway: giải nén JPEG cho LCD
idf.py add-dependency "espressif/esp_lcd_touch_gt911^1"  # Gateway: cảm ứng (như mẫu Waveshare)
idf.py add-dependency "lvgl/lvgl>8.3.9,<9"               # Gateway: LVGL 8 (như mẫu Waveshare), lock đang ở 8.4.0
```

Node phòng khách khai báo `lvgl/lvgl: "~8.4.0"` trong `components/drivers/idf_component.yml` (cùng bản Gateway, port ở `drv_display`). Giống Gateway, mã LVGL đặt sẵn ở `components/lvgl__lvgl/` (component manager ưu tiên component cùng tên trong `components/`); thư mục đó và `dependencies.lock` của hai project này bị gitignore vì lock trỏ đường dẫn tuyệt đối theo máy.

Lệnh ghi vào `main/idf_component.yml`. Lần `build` tiếp theo, component được tải vào `managed_components/` và phiên bản cụ thể được ghi vào `dependencies.lock`.

- **Commit:** `main/idf_component.yml`, `dependencies.lock` (để cả nhóm và CI build cùng phiên bản).
- **Không commit:** `managed_components/` (tải lại được).
- Phiên bản ghi ở trên là điểm bắt đầu. Kiểm bản mới nhất trên registry trước khi chốt.

---

## 3. Chọn chip và cấu hình

### 3.1. Chọn target

```powershell
idf.py set-target esp32s3    # Gateway Waveshare
idf.py set-target esp32      # ESP32-CAM
```

`set-target` **xoá `build/` và `sdkconfig`** rồi tạo lại từ `sdkconfig.defaults`. Chỉ chạy khi tạo project hoặc khi đổi chip.

### 3.2. `menuconfig`, `sdkconfig` và `sdkconfig.defaults`

```powershell
idf.py menuconfig        # giao diện chọn cấu hình (phím / để tìm, S lưu, Q thoát)
idf.py save-defconfig    # ghi các giá trị khác mặc định ra sdkconfig.defaults
```

| File | Vai trò | Git |
|---|---|---|
| `sdkconfig` | Cấu hình đầy đủ, sinh tự động, đổi mỗi lần `menuconfig` | **Không commit** |
| `sdkconfig.defaults` | Chỉ các giá trị khác mặc định, là nguồn của `sdkconfig` | Commit |
| `sdkconfig.defaults.esp32s3`, `sdkconfig.defaults.esp32` | Tự nạp thêm theo target | Commit |
| `main/Kconfig.projbuild` | Khai báo tuỳ chọn riêng của project (VD `NODE_TYPE`) | Commit |

Sau `save-defconfig` phải đọc lại `sdkconfig.defaults` trước khi commit: **không được có SSID, mật khẩu WiFi, secret thiết bị** (mục 7).

`sdkconfig.defaults` chỉ áp cho các tuỳ chọn **chưa có** trong `sdkconfig`. Sửa `sdkconfig.defaults` khi đã có `sdkconfig` thì giá trị mới không tự có hiệu lực: xoá `sdkconfig` (hoặc chạy lại `set-target`) rồi build.

Cấu hình mẫu cho từng board: Gateway ở mục 2.2 bước 2, ESP32-CAM ở mục 2.3 bước 2.

### 3.3. Nhiều biến thể từ một project

Khi dùng chung một codebase cho nhiều dòng thiết bị ([Firmware](../firmware/EMBEDDED_ARCHITECTURE_ESP_IDF.md) §5), tách thư mục build và cấu hình cho từng biến thể:

```powershell
idf.py -B build_gateway -D SDKCONFIG=build_gateway/sdkconfig `
       -D SDKCONFIG_DEFAULTS="sdkconfig.defaults;sdkconfig.defaults.gateway" build

idf.py -B build_sensor  -D SDKCONFIG=build_sensor/sdkconfig `
       -D SDKCONFIG_DEFAULTS="sdkconfig.defaults;sdkconfig.defaults.sensor_node" build
```

Các lệnh khác (`flash`, `monitor`, `menuconfig`) cũng phải kèm đúng `-B` và `-D SDKCONFIG=...` của biến thể đó.

---

## 4. Bảng phân vùng flash

Theo [Firmware](../firmware/EMBEDDED_ARCHITECTURE_ESP_IDF.md) §15: luôn có **2 slot OTA** để rollback được. Bỏ trống cột `Offset` thì công cụ tự tính và tự căn lề 64 KB cho phân vùng app.

`partitions_gateway.csv` (flash 16 MB):

```csv
# Name,    Type, SubType, Offset, Size
nvs,       data, nvs,     ,       24K
otadata,   data, ota,     ,       8K
phy_init,  data, phy,     ,       4K
factory,   app,  factory, ,       1536K
ota_0,     app,  ota_0,   ,       1536K
ota_1,     app,  ota_1,   ,       1536K
storage,   data, spiffs,  ,       512K
log,       0x40, 0x00,    ,       256K
```

`partitions_node.csv` (flash 4 MB, không có `factory`):

```csv
# Name,    Type, SubType, Offset, Size
nvs,       data, nvs,     ,       16K
otadata,   data, ota,     ,       8K
phy_init,  data, phy,     ,       4K
ota_0,     app,  ota_0,   ,       1920K
ota_1,     app,  ota_1,   ,       1920K
log,       0x40, 0x00,    ,       64K
```

- `log` dùng type tự định nghĩa `0x40` (dải 0x40–0xFE dành cho ứng dụng), đọc/ghi bằng `esp_partition_*`.
- `storage` để subtype `spiffs`; component LittleFS (`joltwallet/littlefs`) mount được phân vùng này.
- Phân vùng `nvs_keys` (NVS Encryption) chỉ thêm ở giai đoạn Security hardening ([Firmware](../firmware/EMBEDDED_ARCHITECTURE_ESP_IDF.md) §19, §21 Phase 6).
- Gateway có LVGL + WiFi + TLS + JPEG, app có thể vượt 1,5 MB. Nếu build báo `app partition is too small`, tăng 3 phân vùng app lên `3M` (flash 16 MB còn dư) và cập nhật lại §15.1 của tài liệu Firmware.

```powershell
idf.py partition-table    # build và in bảng phân vùng (kèm offset đã tính)
```

---

## 5. Build

```powershell
cd firmware\camera
idf.py build
```

Lần đầu mất vài phút (biên dịch toàn bộ ESP-IDF). Các lần sau chỉ biên dịch file đổi.

File sinh ra trong `build/`:

| File | Nạp ở địa chỉ |
|---|---|
| `bootloader/bootloader.bin` | `0x0` (ESP32-S3) hoặc `0x1000` (ESP32) |
| `partition_table/partition-table.bin` | `0x8000` |
| `ota_data_initial.bin` | Offset của `otadata` |
| `<tên_project>.bin` | Offset của app đầu tiên |
| `<tên_project>.elf` | Không nạp — dùng để giải mã backtrace khi crash |
| `flash_args` | Danh sách địa chỉ + file, dùng cho `esptool` (mục 6.3) |

Các lệnh liên quan:

```powershell
idf.py size               # dung lượng app, RAM tĩnh
idf.py size-components    # dung lượng theo từng component (tìm thư viện nặng)
idf.py reconfigure        # chạy lại CMake (sau khi thêm file .c, đổi CMakeLists)
idf.py fullclean          # xoá sạch build/ (khi đổi target, đổi cấu hình lớn)
idf.py update-dependencies   # cập nhật managed component theo idf_component.yml
```

---

## 6. Nạp firmware và xem log

### 6.1. Tìm cổng COM

```powershell
[System.IO.Ports.SerialPort]::GetPortNames()
```

Hoặc xem *Device Manager → Ports (COM & LPT)*. Gateway S3 cắm cổng USB-C hiện là *USB Serial Device* / *USB JTAG/serial debug unit*. ESP32-CAM qua đế ESP32-CAM-MB hiện là cổng của chip CH340.

### 6.2. Build + nạp + xem log

```powershell
idf.py -p COM5 flash monitor             # build nếu cần, nạp, rồi mở log
idf.py -p COM5 -b 921600 flash           # nạp nhanh hơn (cáp/đế không ổn thì hạ về 460800)
idf.py -p COM5 app-flash                 # chỉ nạp app, bỏ qua bootloader và bảng phân vùng
idf.py -p COM5 monitor                   # chỉ xem log; thoát bằng Ctrl+]
```

`monitor` tự giải mã địa chỉ trong backtrace khi crash nhờ file `.elf`, nên luôn mở monitor **trong thư mục project vừa build**.

**Vào chế độ nạp:**

| Thiết bị | Cách |
|---|---|
| Gateway Waveshare | Thường tự vào qua USB. Nếu báo `Failed to connect`: giữ **BOOT**, nhấn **RESET**, nhả BOOT, rồi nạp lại |
| ESP32-CAM | Không có USB-UART trên module. Dùng đế ESP32-CAM-MB hoặc USB-TTL; nối **GPIO0 xuống GND** khi nạp, gỡ ra và reset để chạy ([IOT_NODE_NETWORK](../firmware/IOT_NODE_NETWORK.md) §4.2) |

### 6.3. Nạp không cần project (giao file `.bin` cho người khác)

```powershell
cd build
python -m esptool --chip esp32s3 -p COM5 -b 460800 write_flash '@flash_args'
```

Trong PowerShell phải để `'@flash_args'` trong nháy đơn — `@` không có nháy là toán tử splatting của PowerShell.

### 6.4. Xoá flash

```powershell
idf.py -p COM5 erase-flash
```

Lệnh này **xoá cả NVS**: WiFi, secret thiết bị, trạng thái provision đều mất. Thiết bị phải provision/claim lại. Chỉ dùng khi thật cần.

---

## 7. Credential và chứng chỉ — không đưa vào git

Quy tắc của dự án: không log password/token/secret, không commit credential, không tắt kiểm chứng TLS ([Bảo mật](../SECURITY_ARCHITECTURE.md)).

### 7.1. Không để credential trong Kconfig

`sdkconfig.defaults` được commit. Vì vậy **không** khai báo `CONFIG_WIFI_PASSWORD`, `CONFIG_DEVICE_SECRET`… trong `Kconfig.projbuild` rồi điền giá trị: chỉ cần một lần `save-defconfig` là giá trị lọt vào git.

Hướng đích là lưu trong NVS ([Firmware](../firmware/EMBEDDED_ARCHITECTURE_ESP_IDF.md) §16, §21 Phase 1). Trong giai đoạn dev, khi chưa có provisioning, nạp NVS từ một file CSV **gitignore**:

`nvs_dev.csv` (không commit):

```csv
key,type,encoding,value
wifi,namespace,,
ssid,data,string,<SSID>
password,data,string,<MẬT_KHẨU_WIFI>
identity,namespace,,
device_uuid,data,string,<DEVICE_ID>
device_secret,data,string,<SECRET>
```

```powershell
# Sinh ảnh NVS đúng kích thước phân vùng nvs (24K = 0x6000 cho Gateway, 16K = 0x4000 cho Node)
python $env:IDF_PATH\components\nvs_flash\nvs_partition_generator\nvs_partition_gen.py `
       generate nvs_dev.csv nvs_dev.bin 0x6000

# Ghi vào phân vùng nvs (không đụng tới app)
python $env:IDF_PATH\components\partition_table\parttool.py -p COM5 `
       write_partition --partition-name=nvs --input nvs_dev.bin
```

Xoá `nvs_dev.bin` sau khi nạp. Secret thiết bị lấy từ lúc tạo thiết bị trên backend (backend chỉ trả về 1 lần, lúc tạo).

### 7.2. Chứng chỉ CA của Broker 2 (MQTT TLS)

CA sinh bởi `infra/pki/gen_mqtt_certs.sh` (ra `infra/mosquitto/certs/ca.crt`, xem [MQTT_TLS](MQTT_TLS.md)). Chép `ca.crt` vào project (thư mục `certs/`, gitignore giống `mqtt_ca_cert.h` hiện tại) rồi nhúng vào firmware:

```cmake
# main/CMakeLists.txt
idf_component_register(SRCS "gateway.c"
                       INCLUDE_DIRS "."
                       EMBED_TXTFILES "../certs/mqtt_ca.crt")
```

```c
extern const char mqtt_ca_crt_start[] asm("_binary_mqtt_ca_crt_start");

const esp_mqtt_client_config_t cfg = {
    .broker.address.uri = "mqtts://<broker-host>:8883",
    .broker.verification.certificate = mqtt_ca_crt_start,
};
```

Không bật `skip_cert_common_name_check`, không bỏ trống `certificate` khi dùng `mqtts://`. Tên host trong URI phải khớp SAN của chứng chỉ server.

### 7.3. `.gitignore` đề xuất cho project ESP-IDF

Ví dụ Waveshare đã có `.gitignore` riêng. Khi tạo project mới trong `firmware/`, thêm vào `.gitignore` gốc:

```gitignore
# ESP-IDF
firmware/**/build/
firmware/**/build_*/
firmware/**/sdkconfig
firmware/**/sdkconfig.old
firmware/**/managed_components/
firmware/**/certs/
firmware/**/nvs_*.csv
firmware/**/nvs_*.bin
```

Job "Bảo mật repo" của CI hiện chặn `config_*.h`, `mqtt_ca_cert.h`, `.env`, `*.key|*.pem|*.p12|*.pfx`. Chưa chặn `nvs_*.csv` — nên thêm mẫu này vào job khi có project ESP-IDF đầu tiên.

---

## 8. Build bằng PlatformIO và CI

CI hiện chỉ build `firmware/gateway-node` và `firmware/sensor-node` bằng `pio run` (`.github/workflows/ci.yml`, job `firmware`). Project ESP-IDF mới có hai cách đưa vào CI.

**Cách 1 — action chính thức của Espressif** (dùng đúng `idf.py`, cùng phiên bản với máy dev):

```yaml
- uses: espressif/esp-idf-ci-action@v1
  with:
    esp_idf_version: v5.4.4
    target: esp32s3
    path: firmware/gateway-node
```

Thêm đường dẫn project mới vào bộ lọc `firmware:` của job `changes`, nếu không CI sẽ không chạy khi project đổi.

**Cách 2 — PlatformIO với `framework = espidf`** ([IOT_NODE_NETWORK](../firmware/IOT_NODE_NETWORK.md) §8), giữ được lệnh `pio run` hiện có:

```ini
; platformio.ini
[platformio]
src_dir = main

[env:gateway]
platform = espressif32
board = esp32-s3-devkitc-1
framework = espidf
board_build.partitions = partitions_gateway.csv
board_upload.flash_size = 16MB
```

PlatformIO tự mang một bản ESP-IDF riêng, có thể khác v5.4.4 trên máy. Nếu chọn cách này, ghim phiên bản `platform = espressif32@<x.y.z>` và kiểm bản ESP-IDF đi kèm.

Cách 1 gọn hơn vì không phải duy trì hai hệ build song song.

---

## 9. Xử lý sự cố

| Triệu chứng | Nguyên nhân | Cách xử lý |
|---|---|---|
| `idf.py : The term 'idf.py' is not recognized` | Terminal chưa nạp môi trường | Chạy lại mục 1.2 trong terminal đó |
| `ESP-IDF Python virtual environment "...py3.14_env..." not found` | Gọi `export.ps1` trực tiếp, script lấy nhầm Python hệ thống | Dùng `Initialize-Idf.ps1` hoặc shortcut "ESP-IDF 5.4 PowerShell" |
| `MSys/Mingw is not supported` | Chạy trong Git Bash | Dùng PowerShell hoặc cmd |
| Lỗi đường dẫn lạ khi build | Đường dẫn project có dấu cách, ký tự tiếng Việt có dấu, hoặc quá dài | Để project ở đường dẫn ngắn, chỉ ký tự ASCII (VD `E:\WorkSpace\...`) |
| `Target 'esp32' of the project does not match target 'esp32s3' in sdkconfig` | Đổi chip mà chưa `set-target` | `idf.py set-target <chip>` |
| `app partition is too small for binary` | App vượt kích thước phân vùng | `idf.py size-components` tìm phần nặng; tăng phân vùng app (mục 4) |
| `Failed to connect to ESP32: No serial data received` | Chip chưa vào chế độ nạp | Gateway: giữ BOOT + nhấn RESET. ESP32-CAM: nối GPIO0–GND |
| `could not open port 'COM5': PermissionError` | Cổng đang bị chương trình khác giữ (monitor cũ, Serial Monitor của Arduino/PlatformIO) | Đóng chương trình đó rồi nạp lại |
| `Brownout detector was triggered` (ESP32-CAM) | Nguồn USB yếu khi bật WiFi + camera | Dùng nguồn 5 V ≥ 2 A, cáp ngắn |
| Không tải được component khi build | Mất mạng, registry chặn | Kiểm mạng; có `dependencies.lock` thì build lại khi có mạng một lần là đủ |
| LCD Gateway trôi hình khi ghi NVS/OTA | Cache tắt tạm khi ghi flash | Giữ `CONFIG_SPIRAM_FETCH_INSTRUCTIONS`, `CONFIG_SPIRAM_RODATA` (mục 2.2 bước 2); xem [IOT_NODE_NETWORK](../firmware/IOT_NODE_NETWORK.md) §3 |
| Gateway: boot báo lỗi PSRAM hoặc `psram 0 MB` | Để PSRAM chế độ Quad, trong khi N16R8 là Octal | `CONFIG_SPIRAM_MODE_OCT=y`, xoá `sdkconfig`, build lại |
| ESP32-CAM: `Camera probe failed with error 0x105` | Cáp camera lỏng hoặc sơ đồ chân không đúng module | Cắm lại cáp OV2640; đối chiếu sơ đồ chân ở mục 2.3 bước 5 với module thật |

---

## 10. Bảng lệnh nhanh

| Việc | Lệnh |
|---|---|
| Mở môi trường (PowerShell) | `& C:\Espressif\Initialize-Idf.ps1 -IdfId <idfSelectedId>` |
| Tạo project | `idf.py create-project --path <thư_mục> <tên>` |
| Tạo từ ví dụ registry | `idf.py create-project-from-example "<namespace>/<component>:<ví_dụ>"` |
| Tạo component | `idf.py -C components create-component <tên>` |
| Thêm thư viện | `idf.py add-dependency "<namespace>/<component>^<phiên_bản>"` |
| Chọn chip | `idf.py set-target esp32s3` / `esp32` |
| Cấu hình | `idf.py menuconfig` → `idf.py save-defconfig` |
| Xem bảng phân vùng | `idf.py partition-table` |
| Build | `idf.py build` |
| Xem dung lượng | `idf.py size` / `idf.py size-components` |
| Nạp + log | `idf.py -p COM5 flash monitor` (thoát: `Ctrl+]`) |
| Chỉ nạp app | `idf.py -p COM5 app-flash` |
| Nạp bằng esptool | `cd build; python -m esptool --chip esp32s3 -p COM5 write_flash '@flash_args'` |
| Ghi NVS dev | `nvs_partition_gen.py generate …` → `parttool.py write_partition --partition-name=nvs …` |
| Xoá flash (mất NVS) | `idf.py -p COM5 erase-flash` |
| Dọn build | `idf.py fullclean` |

---

## Tham chiếu

- ESP-IDF v5.4 — Get Started, `idf.py`, Build System, Partition Tables, NVS Partition Generator: <https://docs.espressif.com/projects/esp-idf/en/v5.4.4/>
- ESP Component Registry: <https://components.espressif.com>
- `espressif/esp-idf-ci-action`: <https://github.com/espressif/esp-idf-ci-action>
- Waveshare ESP32-S3-Touch-LCD-4.3B (sơ đồ chân, ví dụ ESP-IDF): <https://docs.waveshare.com/ESP32-S3-Touch-LCD-4.3B>
- Trong repo: [Firmware](../firmware/EMBEDDED_ARCHITECTURE_ESP_IDF.md) · [IOT_NODE_NETWORK](../firmware/IOT_NODE_NETWORK.md) · [WiFi Provisioning](../firmware/SMART_HOME_WIFI_PROVISIONING.md) · [MQTT_TLS](MQTT_TLS.md)
