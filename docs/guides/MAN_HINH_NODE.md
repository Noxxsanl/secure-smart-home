# MAN_HINH_NODE.md

> **Màn hình của Node phòng khách: LVGL được đưa vào thế nào, từng tầng làm gì, và cách thay màn hình khác hoặc đổi bản LVGL**
> Mô tả **hiện trạng code**. Đấu dây và hiệu chuẩn cảm ứng nhanh: [README của node](../../firmware/esp32_s3_firmware_node/README.md#màn-hình). Màn hình Gateway (cùng LVGL 8.4): [MAN_HINH_GATEWAY](MAN_HINH_GATEWAY.md). Build/nạp chung: [ESP_IDF_BUILD](ESP_IDF_BUILD.md).

| | |
|---|---|
| **Firmware** | `firmware/esp32_s3_firmware_node` (ESP-IDF 5.4.4, `esp32s3`) |
| **Phần cứng** | TFT 3.5" **ILI9488** SPI 320×480 + cảm ứng điện trở **XPT2046**, chung bus SPI2 |
| **LVGL** | **8.4.0**, cùng bản Gateway (`08_lvgl_Porting`) |
| **Hiện trạng** | Build đạt (0 cảnh báo), `app_main` bật màn hình + màn hình kiểm tra cảm ứng. **Chưa nạp lên board**: số hiệu chuẩn cảm ứng mặc định là ước lượng |
| **Ngày viết** | 2026-11-09 |

---

## 1. Các tầng và nguyên tắc

```
main/app_main.c
 ├─ board_display_init()                 components/board/      chân GPIO, hướng, hiệu chuẩn (Kconfig)
 │    ├─ drv_spi_bus_init()               drivers/src/bus/       bus SPI2 dùng chung LCD + cảm ứng
 │    ├─ drv_ili9488_init() + rotation    drivers/src/lcd/       panel esp_lcd, đổi RGB565 → RGB666
 │    ├─ drv_display_init()               drivers/src/lcd/       PORT LVGL: tick, task, khoá, flush
 │    └─ drv_xpt2046_init()               drivers/src/touch/     đọc cảm ứng, quy đổi toạ độ
 │       + drv_display_add_touch()        drivers/src/lcd/       gắn cảm ứng vào LVGL
 ├─ node_ui_start()                       components/ui/         widget LVGL + font tiếng Việt
 └─ board_display_backlight_on()
```

Ba nguyên tắc giữ cho việc thay thế sau này gọn:

1. **Chỉ 3 chỗ biết LVGL**: `drv_display` (port: nối LVGL với phần cứng), `ui` (widget) và `ui/fonts` (font). `drv_ili9488`, `drv_xpt2046`, `board` không gọi `lv_*`. Đổi bản LVGL chỉ sửa 3 chỗ này.
2. **Chỉ `board` biết số chân** (qua Kconfig). Driver nhận chân qua struct `*_config_t`.
3. **`ui` không biết phần cứng**: chỉ dùng `drv_display_lock/unlock`. Đổi màn hình (cùng độ phân giải) không phải sửa `ui`.

Bản đồ "đổi gì thì sửa ở đâu":

| Muốn đổi | Sửa | Giữ nguyên |
|---|---|---|
| Chân, hướng, xung nhịp SPI, độ sáng, hiệu chuẩn | `idf.py menuconfig` → *Node S3: màn hình* | Toàn bộ code |
| Màn hình SPI khác (ST7789, ILI9341, ST7796…) | Driver panel mới, `board_display.c`, cách báo flush xong trong `drv_display.c` (mục 6.2) | `ui`, `drv_xpt2046` |
| Cảm ứng khác (GT911, FT6x36, CST816…) | Driver cảm ứng, `touch_read_cb` trong `drv_display.c`, `board_display.c` (mục 6.4) | `ui`, driver panel |
| Màn hình RGB/song song | Viết port mới theo Gateway (mục 6.3) | `ui` |
| Bản LVGL | `idf_component.yml`, `components/lvgl__lvgl/`, `sdkconfig.defaults`, `drv_display`, `ui`, font (mục 7) | `board`, `drv_ili9488`, `drv_xpt2046` |

---

## 2. LVGL được đưa vào project thế nào

### 2.1. Nguồn thư viện

| File | Vai trò |
|---|---|
| `components/drivers/idf_component.yml` | Khai báo `lvgl/lvgl: "~8.4.0"` (nhận bản vá 8.4.x, không tự lên 8.5/9), `require: public` vì `drv_display.h` lộ kiểu `lv_disp_t`, `lv_indev_t` |
| `components/lvgl__lvgl/` | Mã nguồn LVGL 8.4.0 **đặt sẵn như Gateway**. Component manager thấy component cùng tên trong `components/` thì dùng bản này, không tải mạng. **Gitignore** (~99 MB) |
| `dependencies.lock` | Sinh lại mỗi lần build. Trỏ tới `components/lvgl__lvgl` bằng đường dẫn tuyệt đối của từng máy nên **gitignore** (giống Gateway) |

Máy mới clone về chưa có `components/lvgl__lvgl/`: lần build đầu component manager tải LVGL theo `idf_component.yml` vào `managed_components/`. Muốn đặt vào `components/` như Gateway thì chuyển thư mục:

```bat
move managed_components\lvgl__lvgl components\lvgl__lvgl
```

Tên component là `lvgl__lvgl` (dạng `<namespace>__<tên>` của registry). `drivers/CMakeLists.txt` dùng đúng tên này trong `REQUIRES` và để tắt cảnh báo `-Wno-format` riêng cho thư viện LVGL (LVGL 8 sinh cảnh báo format với ESP-IDF 5, Gateway cũng tắt như vậy).

### 2.2. Cấu hình LVGL

LVGL lấy cấu hình từ **Kconfig** (menuconfig → *Component config → LVGL configuration*), không dùng `lv_conf.h`. Giá trị của project nằm ở khối cuối `sdkconfig.defaults`:

| Tuỳ chọn | Giá trị | Lý do |
|---|---|---|
| `CONFIG_LV_COLOR_DEPTH_16` | `y` | RGB565 |
| `CONFIG_LV_COLOR_16_SWAP` | `n` | `drv_ili9488` nhận RGB565 theo thứ tự byte CPU rồi tự đổi. Bật nhầm thì `drv_display.c` báo `#error` lúc build |
| `CONFIG_LV_MEM_CUSTOM` | `y` | LVGL cấp phát bằng `malloc` của ESP-IDF; khối lớn tự vào PSRAM. Không giữ vùng nhớ cố định 32 KB |
| `CONFIG_LV_MEMCPY_MEMSET_STD` | `y` | Dùng `memcpy/memset` của libc (nhanh hơn bản của LVGL) |
| `CONFIG_LV_USE_LOG` + `CONFIG_LV_LOG_PRINTF` | `y` | Cảnh báo của LVGL ra cổng log |
| `CONFIG_LV_ATTRIBUTE_FAST_MEM_USE_IRAM` | `y` | Hàm vẽ nóng của LVGL chạy từ IRAM |
| `CONFIG_LV_USE_FONT_COMPRESSED` | `y` | Font tiếng Việt sinh dạng nén RLE (mục 5) |

`sdkconfig.defaults` chỉ được áp khi **sinh `sdkconfig` mới**. Sửa khối này xong: xoá `sdkconfig` rồi build lại, hoặc chỉnh trực tiếp trong menuconfig.

---

## 3. Port LVGL: `drv_display`

File: `components/drivers/include/drv_display.h`, `components/drivers/src/lcd/drv_display.c`. Đây là chỗ **duy nhất** gọi API driver của LVGL (`lv_disp_drv_*`, `lv_indev_drv_*`, `lv_tick_inc`, `lv_timer_handler`).

| Phần | Cách làm | Ghi chú khi đổi |
|---|---|---|
| Nhịp tick | `esp_timer` chu kỳ 2 ms gọi `lv_tick_inc(2)` | LVGL 8.4 không có Kconfig cho biểu thức tick tuỳ chỉnh (`LV_TICK_CUSTOM_SYS_TIME_EXPR`), nên dùng timer như Gateway |
| Task LVGL | Task `lvgl`, nhân 1, ưu tiên 2, stack 6 KB. Vòng lặp: khoá → `lv_timer_handler()` → mở khoá → ngủ 5–500 ms theo giá trị trả về | Nhân 0 để cho WiFi/ESP-NOW. Đổi qua `drv_display_config_t` (`DRV_DISPLAY_CONFIG_DEFAULT()`) |
| Khoá | Mutex đệ quy. `drv_display_lock(timeout_ms)` / `drv_display_unlock()` | **Mọi `lv_*` gọi ngoài task LVGL phải nằm trong khoá**. Callback sự kiện widget và `lv_timer` chạy trong task LVGL, đã giữ khoá sẵn |
| Bộ đệm vẽ | 1 bộ, `rộng × 40 dòng × 2 byte` trong SRAM nội: ~25 KB khi dọc, ~38 KB khi ngang | Thiếu SRAM thì đặt `buf_psram = true` (chậm hơn) hoặc giảm `buf_lines` |
| Flush | `esp_lcd_panel_draw_bitmap()` rồi gọi **ngay** `lv_disp_flush_ready()` | **Chỉ đúng vì `drv_ili9488` chép xong vùng vẽ sang bộ đệm DMA riêng trước khi trả về.** Panel khác gửi thẳng bộ đệm LVGL bằng DMA thì phải báo xong trong callback, xem mục 6.2 |
| Cảm ứng | `drv_display_add_touch()` đăng ký thiết bị trỏ; `touch_read_cb` gọi `drv_xpt2046_read()` | Đọc trong task LVGL nên nối tiếp với flush, không tranh bus SPI trong cùng task |
| Kích thước | Lấy từ `drv_ili9488_get_size()` **lúc init** | Xoay màn hình phải làm **trước** `drv_display_init()` |

---

## 4. Phần cứng: `drv_ili9488`, `drv_xpt2046`, `board_display`

### 4.1. `drv_ili9488` — panel

- Cài theo giao diện `esp_lcd_panel_t` của ESP-IDF (`reset`, `init`, `draw_bitmap`, `mirror`, `swap_xy`…), nên code phía trên chỉ thấy `esp_lcd_panel_handle_t`.
- ILI9488 qua SPI **không nhận màu 16 bit**, chỉ nhận 18 bit (3 byte/điểm, `COLMOD = 0x66`). `draw_bitmap` đổi RGB565 → RGB666 từng khúc 3200 điểm vào 2 bộ đệm DMA luân phiên (2 × 9,6 KB SRAM): đổi khúc này trong lúc SPI gửi khúc kia.
- Xoay bằng thanh ghi `MADCTL` (bit MV/MX/MY), thứ tự màu bằng bit BGR. Đèn nền: PWM LEDC (timer 0, kênh 0), 5 kHz.

### 4.2. `drv_xpt2046` — cảm ứng điện trở

- Chung bus SPI2 với LCD, CS riêng, 2 MHz (chip tối đa 2,5 MHz). MISO của bus chỉ nối T_DO: SDO của ILI9488 không thả trở kháng cao.
- Khi T_IRQ ở mức cao (không chạm) thì không đọc SPI. Đang chạm: đo áp lực Z (`Z1 + 4095 − Z2`) so với ngưỡng, rồi đo X và Y, mỗi trục 5 lần lấy trung vị (bỏ lần đầu sau khi đổi kênh).
- Quy đổi tuyến tính theo **số đo thô tại 4 mép màn hình** (`raw_left/right/top/bottom`) và cờ `swap_xy`. Mép phải nhỏ hơn mép trái là bình thường (trục ngược), không cần cờ mirror.
- Bật `log_raw` để in số thô khi chạm. Cách hiệu chuẩn từng bước: [README của node](../../firmware/esp32_s3_firmware_node/README.md#hiệu-chuẩn-cảm-ứng-lần-đầu-lắp).

### 4.3. `board_display` + `Kconfig.projbuild`

- Nơi duy nhất có số chân. Menu *Node S3: màn hình (ILI9488 + cảm ứng XPT2046)*: chân (mặc định GPIO7–15, SPI2 trên chân IOMUX 10–13), hướng (mặc định ngang 480×320), xung nhịp LCD (40 MHz), BGR, đảo màu, độ sáng, bật/tắt cảm ứng, hiệu chuẩn, ngưỡng áp lực, log thô.
- Thứ tự trong `board_display_init()`: bus SPI → panel → xoay → `drv_display_init` → cảm ứng. Cảm ứng lỗi chỉ cảnh báo, màn hình vẫn chạy.
- Đèn nền để tắt lúc init, `app_main` bật sau khi `node_ui_start()` đã dựng màn hình, tránh lộ nội dung rác trong RAM màn hình.

---

## 5. Giao diện và font tiếng Việt: `ui`

- `components/ui/src/node_ui.c`: màn hình kiểm tra (chấm xanh theo ngón tay, toạ độ chạm, nút "Bấm thử" có đếm), cùng bảng màu với `gw_ui.c`. Dựng trong `drv_display_lock/unlock`.
- Font Montserrat có sẵn của LVGL **chỉ có ASCII**. UI tiếng Việt có dấu (bất biến 10) dùng `components/ui/fonts/node_font_vi_16.c` và `node_font_vi_24.c`, chép từ `gw_font_vi_16/24.c` của Gateway và chỉ đổi tên symbol.
- Font gồm: ASCII, dấu độ, 134 chữ cái tiếng Việt, và 7 biểu tượng `LV_SYMBOL_` (HOME, OK, WIFI, WARNING, LIST, VIDEO, UPLOAD). Chữ hoặc biểu tượng ngoài bộ font hiện thành ô trống.
- Thêm cỡ chữ, ký tự hoặc biểu tượng: sửa `components/ui/fonts/gen_fonts.sh` (danh sách `size`, `SYMBOLS`) rồi chạy bằng Git Bash. Script cần Node.js (`npx` tải `lv_font_conv@1.5.2` vào cache npm) và font nguồn trong `components/lvgl__lvgl/scripts/built_in_font/`. Cỡ mới phải thêm vào `ui/CMakeLists.txt` và `LV_FONT_DECLARE` trong code.

---

## 6. Thay màn hình khác

### 6.1. Trả lời trước khi bắt tay

| Câu hỏi | Ảnh hưởng |
|---|---|
| Giao tiếp: SPI, i80 (song song 8/16 bit) hay RGB? | SPI: làm theo 6.2. i80/RGB: 6.3 |
| Chip điều khiển (ST7789, ILI9341, ST7796, ILI9486, GC9A01…)? | Có driver `esp_lcd` sẵn không (trong ESP-IDF hoặc ESP Registry) |
| Màu trên dây: 16 bit (RGB565) hay chỉ 18 bit? | 16 bit: LVGL gửi thẳng, cần đảo byte. 18 bit: phải đổi màu như `drv_ili9488` |
| Độ phân giải, hướng dùng? | Kích thước bộ đệm vẽ, bố cục `ui` |
| Cảm ứng: điện trở (XPT2046), điện dung I2C (GT911, FT6x36, CST816), hay không có? | 6.4 |
| Đèn nền: chân PWM, có transistor trên module chưa? | `bl_gpio`, `bl_active_low` |

### 6.2. Màn hình SPI khác (ví dụ ST7789, ILI9341, ST7796)

1. **Driver panel.** ESP-IDF có sẵn `esp_lcd_new_panel_st7789()`. Chip khác thường có trên ESP Registry (`espressif/esp_lcd_ili9341`, `espressif/esp_lcd_st7796`…). Thêm vào `drivers/idf_component.yml` hoặc viết `drv_<chip>.c` cùng kiểu `drv_ili9488` (bọc `esp_lcd`, trả `esp_lcd_panel_handle_t`, có `get_size`, `set_rotation`, `set_backlight`). Chân thêm vào `board/Kconfig.projbuild`, khởi tạo trong `board_display.c`.
2. **Tổng quát `drv_display_init`.** Hàm hiện nhận `drv_ili9488_handle_t`. Đổi thành nhận `esp_lcd_panel_handle_t panel, esp_lcd_panel_io_handle_t io, int width, int height` để dùng cho mọi panel.
3. **Báo flush xong đúng lúc.** Panel 16 bit gửi **thẳng bộ đệm LVGL** bằng DMA, `draw_bitmap` trả về khi DMA còn đang đọc. Gọi `lv_disp_flush_ready()` ngay như hiện tại thì LVGL vẽ đè lên dữ liệu chưa gửi xong (ảnh rách, nhiễu). Phải báo xong trong callback "truyền màu xong" của panel IO:

   ```c
   static bool on_color_done(esp_lcd_panel_io_handle_t io, esp_lcd_panel_io_event_data_t *edata, void *ctx)
   {
       lv_disp_flush_ready((lv_disp_drv_t *)ctx);   /* chạy trong ngắt: chỉ báo, không làm gì nặng */
       return false;
   }

   /* trong drv_display_init, sau lv_disp_drv_register: */
   const esp_lcd_panel_io_callbacks_t cbs = {.on_color_trans_done = on_color_done};
   esp_lcd_panel_io_register_event_callbacks(io, &cbs, &s_disp_drv);

   /* flush_cb chỉ còn: */
   esp_lcd_panel_draw_bitmap(panel, area->x1, area->y1, area->x2 + 1, area->y2 + 1, color_map);
   ```

   Callback chỉ đúng khi panel gửi cả vùng vẽ trong **một** lần `tx_color` (driver `esp_lcd` chuẩn làm vậy). Driver tự chia khúc như `drv_ili9488` thì giữ cách hiện tại: tự chép xong rồi báo ngay.
4. **Bộ đệm vẽ phải DMA được**: cấp phát bằng `MALLOC_CAP_DMA | MALLOC_CAP_INTERNAL` (không dùng `buf_psram`). Nên dùng 2 bộ đệm (`lv_disp_draw_buf_init(&buf, b1, b2, n)`) để LVGL vẽ bộ này trong lúc DMA gửi bộ kia.
5. **Thứ tự byte.** SPI gửi byte cao trước, RGB565 của CPU (little-endian) bị đảo màu. Bật `CONFIG_LV_COLOR_16_SWAP=y` và bỏ điều kiện `LV_COLOR_16_SWAP` trong `#error` đầu `drv_display.c`.
6. Nếu không muốn tự viết port, có thể dùng `espressif/esp_lvgl_port` (bộ port chính thức cho panel `esp_lcd`). Nhưng nó tự tạo task và khoá riêng, phải thay `drv_display_lock/unlock` bằng `lvgl_port_lock/unlock` ở mọi nơi.

Màn hình **chỉ nhận 18 bit** khác (ILI9486/ILI9488 qua SPI): giữ cách của `drv_ili9488` (đổi RGB565 → RGB666 trong `draw_bitmap`), chỉ thay chuỗi lệnh khởi tạo.

### 6.3. Màn hình RGB hoặc i80 (song song)

Khác hẳn SPI: framebuffer cả màn hình trong PSRAM, bounce buffer, chế độ chống xé hình, flush gắn với tín hiệu VSYNC. `drv_display` không dùng lại được nguyên. Làm theo port của Gateway: `08_lvgl_Porting/components/drivers/src/lcd/lvgl_port.c` + `waveshare_rgb_lcd_port.c` (LCD RGB 800×480, LVGL 8.4, cảm ứng GT911), tuỳ chọn ở menu *Example Configuration*. Lưu ý PSRAM khi ghi flash (OTA, NVS): [IOT_NODE_NETWORK](../firmware/IOT_NODE_NETWORK.md) §3.

### 6.4. Cảm ứng khác

- **Điện dung I2C** (GT911, FT5x06/FT6x36, CST816S): dùng `espressif/esp_lcd_touch` + driver chip trên ESP Registry như Gateway (`espressif__esp_lcd_touch_gt911`). Đổi `touch_read_cb` trong `drv_display.c`:

  ```c
  static void touch_read_cb(lv_indev_drv_t *drv, lv_indev_data_t *data)
  {
      esp_lcd_touch_handle_t tp = drv->user_data;
      uint16_t x, y;
      uint8_t n = 0;
      esp_lcd_touch_read_data(tp);
      if (esp_lcd_touch_get_coordinates(tp, &x, &y, NULL, &n, 1) && n > 0) {
          data->point.x = x;
          data->point.y = y;
          data->state = LV_INDEV_STATE_PRESSED;
      } else {
          data->state = LV_INDEV_STATE_RELEASED;
      }
  }
  ```

  Hướng xoay chỉnh bằng `esp_lcd_touch_set_swap_xy/mirror_x/mirror_y`. Cảm ứng điện dung không cần hiệu chuẩn 4 mép.
- **Cẩn thận I2C:** Node dùng driver I2C **mới** (`driver/i2c_master.h`, trong `drv_bus`). ESP-IDF 5 dừng lúc khởi động nếu firmware link cả driver cũ (`driver/i2c.h`) lẫn mới (Gateway gặp, nên Gateway dùng toàn driver cũ). Driver cảm ứng chọn thêm phải chạy được trên bus `i2c_master_bus_handle_t`.
- Muốn `drv_display` không phụ thuộc chip cảm ứng: đổi `drv_display_add_touch` thành nhận con trỏ hàm `bool (*read)(void *ctx, int *x, int *y)` + `ctx`.

### 6.5. Danh sách việc khi thay màn hình

1. Đấu dây, ghi chân vào `board/Kconfig.projbuild` (hoặc đổi giá trị mặc định).
2. Driver panel (6.2/6.3) và driver cảm ứng (6.4) trong `drivers/`, thêm vào `drivers/CMakeLists.txt`.
3. Sửa `board_display.c`: khởi tạo theo thứ tự bus → panel → xoay → `drv_display_init` → cảm ứng.
4. Sửa `drv_display.c` nếu cách flush, thứ tự byte hoặc nguồn cảm ứng khác (6.2 bước 3–5, 6.4).
5. Độ phân giải khác: kiểm bố cục `node_ui.c` (đang căn theo `lv_obj_get_width(scr)`, không cố định số điểm ảnh, trừ nút 220×60).
6. Build không cảnh báo, nạp, kiểm theo mục 8.
7. Cập nhật mục *Màn hình* trong README của node và tài liệu này.

---

## 7. Đổi bản LVGL

### 7.1. Trong cùng 8.x (ví dụ lên bản vá 8.4.x, hoặc về 8.3)

1. Sửa phiên bản trong `components/drivers/idf_component.yml` (`~8.4.0` nhận 8.4.x; về 8.3 thì `~8.3.0`).
2. Xoá `components/lvgl__lvgl/` và `dependencies.lock`, build: component manager tải bản mới vào `managed_components/`. Muốn đặt như Gateway thì chuyển sang `components/` (mục 2.1).
3. Xoá `sdkconfig`, build lại để Kconfig mới nhận giá trị trong `sdkconfig.defaults`. Mở menuconfig xem có tuỳ chọn nào đổi tên không.
4. Thường không phải sửa code. Nên giữ **cùng bản với Gateway** để code giao diện viết một kiểu.

### 7.2. Lên LVGL 9.x

API driver của LVGL 9 đổi hẳn, phải viết lại `drv_display` và sửa tên hàm trong `ui`. Gateway vẫn ở 8.4 nên code giao diện hai bên sẽ khác nhau. Nên lên 9 cho cả hai cùng lúc, hoặc giữ 8.4.

Các chỗ cần đổi (chỉ liệt kê API project đang dùng; đối chiếu lại với tài liệu của đúng bản 9.x đích):

| LVGL 8.4 (hiện tại) | LVGL 9.x | Ở đâu |
|---|---|---|
| `lv_disp_draw_buf_t` + `lv_disp_drv_t` + `lv_disp_drv_register()` | `lv_display_create(w, h)` + `lv_display_set_buffers(disp, b1, b2, size_bytes, LV_DISPLAY_RENDER_MODE_PARTIAL)` + `lv_display_set_flush_cb()` | `drv_display.c` |
| `flush_cb(lv_disp_drv_t *, const lv_area_t *, lv_color_t *)` | `flush_cb(lv_display_t *, const lv_area_t *, uint8_t *px_map)` | `drv_display.c` |
| `lv_disp_flush_ready(drv)` | `lv_display_flush_ready(disp)` | `drv_display.c` |
| `drv->user_data` | `lv_display_set_user_data()` / `lv_display_get_user_data()` | `drv_display.c` |
| `lv_disp_remove()` | `lv_display_delete()` | `drv_display.c` |
| `lv_indev_drv_t` + `lv_indev_drv_register()` | `lv_indev_create()` + `lv_indev_set_type()` + `lv_indev_set_read_cb()` + `lv_indev_set_user_data()` | `drv_display.c` |
| `read_cb(lv_indev_drv_t *, lv_indev_data_t *)` | `read_cb(lv_indev_t *, lv_indev_data_t *)` | `drv_display.c` |
| `lv_disp_t`, `lv_coord_t` | `lv_display_t`, `int32_t` | `drv_display.h`, `ui` |
| `lv_tick_inc()`, `lv_timer_handler()` | Giữ nguyên (9.1+ có thêm `lv_tick_set_cb()` thay timer) | `drv_display.c` |
| `lv_scr_act()`, `lv_btn_create()`, `lv_obj_clear_flag()`, `lv_indev_get_act()` | `lv_screen_active()`, `lv_button_create()`, `lv_obj_remove_flag()`, `lv_indev_active()` | `node_ui.c` |
| `LV_COLOR_16_SWAP` (Kconfig) | Bỏ. Cần đảo byte thì gọi `lv_draw_sw_rgb565_swap()` trong flush. ILI9488 không cần | `drv_display.c`, `sdkconfig.defaults` |
| `CONFIG_LV_MEM_CUSTOM`, `CONFIG_LV_MEMCPY_MEMSET_STD` | Thay bằng lựa chọn thư viện chuẩn (VD `CONFIG_LV_USE_CLIB_MALLOC`, `CONFIG_LV_USE_CLIB_STRING`). Tên chính xác xem Kconfig của bản đích | `sdkconfig.defaults` |

Thứ tự làm:

1. `idf_component.yml` → `~9.x.0`; xoá `components/lvgl__lvgl/`, `dependencies.lock`, `sdkconfig`; build để tải bản mới.
2. Viết lại khối LVGL trong `sdkconfig.defaults` theo Kconfig 9 (mở menuconfig để xem tên).
3. Viết lại `drv_display.c/.h` theo bảng trên. Giữ nguyên **hợp đồng** với phần còn lại: `drv_display_init`, `drv_display_add_touch`, `drv_display_lock/unlock`. Khi đó `board` không phải sửa.
4. Đổi tên hàm trong `node_ui.c`. LVGL 9 có lớp tương thích tên cũ (`lv_api_map_v8.h`) giúp `ui` build tạm, nhưng không phủ API driver.
5. Sinh lại font bằng `gen_fonts.sh` (font hiện tại có điều kiện theo phiên bản nên nhiều khả năng vẫn build được, nhưng nên sinh lại cho chắc). Bộ đệm vẽ của LVGL 9 tính bằng **byte** và cần căn lề 4 byte.
6. Kiểm lại cờ `-Wno-format` trong `drivers/CMakeLists.txt`: bỏ thử, nếu LVGL 9 build sạch thì không cần.

### 7.3. Bản cũ hơn 8 (6.x, 7.x)

Không khuyến nghị: API khác hẳn bản 8, không dùng chung code giao diện với Gateway, phải tự chép mã nguồn vào `components/` và tự viết `CMakeLists.txt` + `lv_conf.h`, và viết lại toàn bộ `drv_display`, `ui`.

---

## 8. Kiểm tra sau khi đổi

**Không cần board** (ESP-IDF CMD, trong `firmware\esp32_s3_firmware_node`):

```bat
del sdkconfig
idf.py set-target esp32s3
idf.py build
```

Đạt khi build **0 cảnh báo** và `drv_display.c` không báo `#error` về màu.

**Trên board:** `idf.py -p COMx flash monitor`. Log khởi động mong đợi (cấu hình mặc định):

```
I drv_bus: SPI2 bus ready (SCLK 12, MOSI 11, MISO 13)
I drv_ili9488: ILI9488 ready (320x480, 40 MHz)            <- kích thước trước khi xoay
I drv_display: LVGL 8.4.0 ready (480x320, buffer 40 lines in SRAM)
I drv_xpt2046: XPT2046 ready (2000 kHz, IRQ 15, 480x320, swap XY)
I board_display: display 480x320 ready, touch on
I app_main: display up (touch on); sensors/relay/ESP-NOW wait for the GPIO map
```

| Kiểm | Đạt khi |
|---|---|
| Hướng, kích thước | Tiêu đề "Node phòng khách" ở góc trên trái, chữ có dấu đầy đủ |
| Màu | Nền xanh đen, nút xanh dương. Đỏ ↔ xanh dương đảo: đổi BGR; âm bản: đổi đảo màu |
| Ảnh | Không sọc, không rách khi chấm xanh chạy. Có sọc: hạ xung nhịp |
| Cảm ứng | Chấm xanh nằm đúng dưới ngón tay ở cả 4 góc; bấm nút thì số đếm tăng |
| Nhớ | Log không có `no mem` của `drv_display` / `drv_ili9488` |

---

## 9. File liên quan

| File | Vai trò |
|---|---|
| `components/drivers/idf_component.yml` | Khai báo bản LVGL |
| `components/lvgl__lvgl/` | Mã nguồn LVGL (gitignore) |
| `sdkconfig.defaults` (khối LVGL) | Cấu hình LVGL |
| `components/drivers/src/lcd/drv_ili9488.c`, `include/drv_ili9488.h` | Panel ILI9488 (`esp_lcd`), đổi màu, xoay, đèn nền |
| `components/drivers/src/touch/drv_xpt2046.c`, `include/drv_xpt2046.h` | Cảm ứng XPT2046, lọc, hiệu chuẩn |
| `components/drivers/src/lcd/drv_display.c`, `include/drv_display.h` | Port LVGL: tick, task, khoá, flush, thiết bị trỏ |
| `components/drivers/CMakeLists.txt` | Nguồn driver, `REQUIRES lvgl__lvgl`, `-Wno-format` cho LVGL |
| `components/board/Kconfig.projbuild` | Menu chân, hướng, hiệu chuẩn |
| `components/board/src/board_display.c`, `include/board_display.h` | Ghép bus → panel → LVGL → cảm ứng |
| `components/ui/src/node_ui.c`, `include/node_ui.h` | Màn hình (hiện là màn hình kiểm tra) |
| `components/ui/fonts/node_font_vi_16.c`, `node_font_vi_24.c`, `gen_fonts.sh` | Font tiếng Việt có dấu |
| `main/app_main.c` | Thứ tự khởi động: màn hình → UI → đèn nền |
| `.gitignore` (gốc repo) | Bỏ qua `components/*__*/` và `dependencies.lock` của node |
