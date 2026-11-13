# MAN_HINH_GATEWAY.md

> **Màn hình cảm ứng của Gateway S3: bố cục, ý nghĩa từng mục, dữ liệu lấy từ đâu**
> Mô tả **hiện trạng code** (không phải thiết kế đích). Thiết kế màn hình đích: [IOT_NODE_NETWORK](../firmware/IOT_NODE_NETWORK.md) §3.3. Nạp firmware: [NAP_CAMERA_GATEWAY](NAP_CAMERA_GATEWAY.md).

| | |
|---|---|
| **Firmware** | `firmware/ESP32-S3-Touch-LCD-4.3B-BOX-Demo/ESP-IDF/08_lvgl_Porting` — giao diện ở `components/ui/src/gw_ui.c`, số liệu ở `components/application/src/gw_app.c`, `components/services/src/gw_registry.c` |
| **Hiện trạng** | Build đạt (ESP-IDF 5.4.4, 0 cảnh báo) và đã nạp lên board 2026-11-09, khởi động bình thường. Phần "lần cuối kết nối" lưu qua khởi động lại **chưa thử với camera thật** (lúc nạp camera không cắm) — cách thử ở mục 6 |
| **Ngày viết** | 2026-11-09 |

---

## 1. Bố cục

Màn hình 800×480, chữ tiếng Việt có dấu:

```
┌ GATEWAY NHÀ THÔNG MINH   WiFi 192.168.x.x   Máy chủ --          12:34:56 ┐  header
│ ┌───────────┐ ┌──────────────────────────────────────────────────────────┐ │
│ │ CAMERA    │ │  nội dung của mục đang chọn                              │ │
│ │ Trực tiếp │ │                                                          │ │
│ ├───────────┤ │                                                          │ │
│ │PHÒNG KHÁCH│ │                                                          │ │
│ │28.4°C 61% │ │                                                          │ │
│ ├───────────┤ │                                                          │ │
│ │ THIẾT BỊ  │ │                                                          │ │
│ │1/1 đã k.n.│ └──────────────────────────────────────────────────────────┘ │
└ dòng trạng thái (hướng dẫn khi lỗi) ───────────────────────────────────────┘  footer
```

| Trang | Nội dung |
|---|---|
| **Camera** | Hình trực tiếp 448×336 từ ESP32-CAM; góc phải hàng tiêu đề: chấm + chữ kết nối Camera ↔ Gateway (kèm số khung/giây khi có hình). Luồng chạy khi đang ở trang này hoặc khi có người xem từ xa; góc trên trái khung hình có nhãn **"Đang được xem từ xa"** khi có phiên xem từ xa (mục 3.2) |
| **Phòng khách** | Nhiệt độ, độ ẩm; trạng thái quạt, điều hoà, đèn, rèm cửa (chờ node gửi); kết nối node ↔ Gateway |
| **Thiết bị** | Bảng các thiết bị đã ghép với Gateway — mục 2 |

Ba nơi dùng **cùng một quy tắc** 3 trạng thái kết nối (mục 2.2): chấm trong bảng Thiết bị, dòng phụ dưới mục nav, chấm ở góc phải trang Camera / Phòng khách.

---

## 2. Trang Thiết bị

```
 THIẾT BỊ ĐÃ GHÉP                     ● Đã kết nối  ● Đang kết nối  ● Chưa kết nối
┌──────────────────┬──────────┬──────────┬─────────┬─────────────┐
│ Thiết bị         │ Loại     │ Trạng thái│ Tín hiệu│ Lần cuối    │
├──────────────────┼──────────┼──────────┼─────────┼─────────────┤
│ cam-door-01      │ Camera   │ ●        │ -58 dBm │ 14:02:31    │
│ livingroom-01    │ Node     │ ●        │ --      │ 08/11 21:47 │
└──────────────────┴──────────┴──────────┴─────────┴─────────────┘
```

### 2.1. Các cột

| Cột | Rộng (px) | Hiện gì | Lấy từ đâu |
|---|---|---|---|
| Thiết bị | 176 | `device_id`; dài hơn 16 ký tự (VD UUID) thì hiện 15 ký tự đầu + `...` | NVS `nodes/<i>_id` |
| Loại | 100 | `Camera` hoặc `Node` | NVS `nodes/<i>_kind` |
| Trạng thái | 104 | **Chỉ 1 chấm màu**: xanh / vàng / đỏ — mục 2.2. Chú thích màu ở góc phải hàng tiêu đề | `gw_app.c` → `device_link()` |
| Tín hiệu | 96 | Cường độ sóng gói ESP-NOW gần nhất, `dBm`; `--` khi chưa nhận gói nào từ lúc Gateway khởi động — mục 2.3 | `gw_espnow.c` → `gw_registry_touch(rssi)` |
| Lần cuối | 126 | **Giờ** lần cuối Gateway nhận gói hợp lệ của thiết bị: hôm nay `HH:MM:SS`, ngày khác `DD/MM HH:MM`, chưa bao giờ `Chưa từng`. Nhớ qua khởi động lại — mục 2.4 | `gw_registry.c` + NVS `seen` |

Mọi ô **không xuống dòng**: chữ dài hơn ô bị cắt, các hàng luôn cao bằng nhau. Độ rộng tính cho nội dung dài nhất ở font 16 px + đệm 10 px mỗi bên ("Camera", "-100 dBm", "08/11 23:59"); tổng 602 px = bề rộng vùng nội dung.

### 2.2. Ba trạng thái kết nối

| Chấm | Trạng thái | Camera | Node |
|---|---|---|---|
| 🟢 xanh | **Đã kết nối** | Có gói ESP-NOW hợp lệ trong 90 s gần nhất **và** đang ở Local AP (đường hình) | Có gói ESP-NOW hợp lệ trong 90 s gần nhất |
| 🟡 vàng | **Đang kết nối** | Mới có **một** trong hai đường: đã vào Local AP nhưng chưa có ESP-NOW, hoặc ngược lại; hoặc Gateway vừa khởi động (< 60 s) mà camera chưa gửi gói | Gateway vừa khởi động (< 60 s) mà node chưa gửi gói (node đang dò kênh) |
| 🔴 đỏ | **Chưa kết nối** | Còn lại: chưa từng thấy, hoặc quá 90 s không có gói và không ở Local AP | Còn lại: chưa từng thấy, hoặc quá 90 s không có gói |

- 90 s = `CONFIG_GW_NODE_OFFLINE_S` (menuconfig → *Gateway S3: services*). Node/camera gửi heartbeat mỗi 30 s, nên 90 s ≈ mất 3 heartbeat liền.
- "Gói hợp lệ" = gói từ MAC đã ghép, giải mã được bằng LMK, đúng khung tin — gói sai bị bỏ, không làm thiết bị "xanh".
- Code: `device_link()` trong `gw_app.c`; hằng `LINK_BOOT_GRACE_US` (60 s).

### 2.3. Cột "Tín hiệu" dùng để làm gì

Đó là **RSSI** (Received Signal Strength Indicator): Gateway đo độ mạnh sóng của **gói ESP-NOW gần nhất** nhận từ thiết bị, đơn vị dBm. Số luôn âm, **càng gần 0 càng mạnh**. Cập nhật mỗi khi có gói (heartbeat 30 s/lần, telemetry, sự kiện).

| RSSI | Đánh giá | Gợi ý |
|---|---|---|
| ≥ −60 dBm | Rất tốt | — |
| −60 … −75 dBm | Ổn | — |
| −75 … −85 dBm | Yếu: dễ rớt gói, camera giật hình, lệnh bật/tắt có lúc phải gửi lại | Dời thiết bị/Gateway gần hơn, bớt vật cản (tường bê tông, tủ kim loại) |
| < −85 dBm | Rất yếu: hay mất kết nối | Như trên, hoặc thêm điểm phát sau này |

Dùng để:
1. **Chọn chỗ đặt** node/camera khi lắp: đứng ở vị trí định gắn, xem số trên Gateway.
2. **Chẩn đoán** khi thiết bị hay chuyển vàng/đỏ hoặc hình camera giật: RSSI thấp → do sóng, không phải do code/cấu hình.
3. Cùng số này được gửi lên Server trong heartbeat (`nodes[].rssi`) để Dashboard theo dõi sau này.

Chỉ phản ánh chặng thiết bị → Gateway (ESP-NOW). Camera gửi hình qua WiFi Local AP — cùng radio, cùng khoảng cách, nên thường tương đương.

### 2.4. Cột "Lần cuối" — lưu qua khởi động lại

**Trước:** chỉ có "N giây trước", tính bằng đồng hồ đếm từ lúc bật Gateway → khởi động lại là mất, hiện "chưa thấy".

**Bây giờ:**

```
gói ESP-NOW hợp lệ ──► gw_registry_touch()          ghi mốc esp_timer (trong RAM)
                            │
gw_registry_status() ──► giờ unix = giờ hiện tại − (bao lâu từ gói cuối)     ← bảng đọc mỗi 2 s
                            │
mỗi 60 s: gw_registry_save_seen() ──► NVS namespace "seen"
        s<i> = giờ unix lần cuối (i64)   h<i> = băm device_id (u32)
                            │
khởi động: gw_registry_load() ──► đọc "seen" ──► thiết bị chưa gửi gói lần nào từ lúc bật thì hiện giờ đã lưu
```

| Câu hỏi | Trả lời |
|---|---|
| Khi nào ghi NVS? | Thiết bị **đang kết nối**: tối đa 5 phút/lần. Vừa **mất kết nối**: ghi đúng mốc cuối 1 lần. Lệnh `restart` từ Server: ghi hết trước khi khởi động lại |
| Có làm mòn flash không? | Không đáng kể: mỗi thiết bị ≤ 12 lần ghi/giờ, mỗi lần 1 mục 8 byte; NVS tự xoay vòng trang (24 KB) |
| Mất điện đột ngột thì sao? | Giờ đã lưu có thể cũ hơn thực tế tối đa 5 phút (nếu thiết bị đang kết nối lúc mất điện). Mất kết nối trước khi mất điện thì giờ đã đúng |
| Gateway chưa có giờ (chưa NTP, RTC trống)? | Chưa lưu được (không có mốc unix); bảng hiện `Chưa từng` hoặc giờ đã lưu trước đó |
| Đổi danh sách `nodes` trong NVS? | Mỗi mục kèm băm `device_id`; không khớp thì bỏ giá trị cũ, không gán nhầm giờ của thiết bị khác |
| Nạp lại `nvs_dev.bin`? | Ghi đè cả phân vùng NVS → mất giờ đã lưu (bình thường) |

Không phải dữ liệu bí mật — namespace `seen` chỉ chứa giờ và băm id.

### 2.5. Lỗi "Camera" xuống dòng chữ "a" — nguyên nhân

Bản trước đã đặt cờ không xuống dòng cho mọi ô (`LV_TABLE_CELL_CTRL_TEXT_CROP`) nhưng chữ vẫn xuống dòng, vì **lỗi của LVGL 8.4**: trong `lv_table.c` (`draw_main`), bảng tính ra cờ `LV_TEXT_FLAG_EXPAND` cho ô có TEXT_CROP rồi **không gán vào** `label_dsc` trước khi gọi `lv_draw_label` → hàm vẽ chữ vẫn tự ngắt dòng ("Camer" / "a"), còn chiều cao hàng lại chỉ tính 1 dòng.

Cách sửa (không đụng thư viện LVGL): sự kiện `LV_EVENT_DRAW_PART_BEGIN` của bảng tự gán `label_dsc->flag |= LV_TEXT_FLAG_EXPAND` cho mọi ô (`on_table_draw_begin` trong `gw_ui.c`), đồng thời nới cột Loại từ 82 lên 100 px.

---

## 3. Trang Camera và Phòng khách

- Chấm kết nối ở góc phải dùng quy tắc mục 2.2. Riêng trang Camera khi đang có hình: xanh "Đã kết nối  3.3 khung/s"; đang mở luồng: vàng; luồng đứt đang thử lại: đỏ.
### 3.1. Đường ống hình camera (2026-11-13)

Trước đây một task `gw_live` vừa đọc luồng MJPEG vừa giải nén từng khung bằng TJpgDec (tuần tự, VGA ≈ 3,3 khung/s). Nay tách:

| Task | Nhân / ưu tiên | Việc |
|---|---|---|
| `gw_live` | 0 / 3 | Chỉ đọc `GET /stream`, đưa mỗi khung vào 1 trong 4 bộ đệm JPEG PSRAM và trao **con trỏ** (không chép) |
| `gw_decode` | 1 / 1 (dưới LVGL) | Chỉ lấy khung **mới nhất** (khung cũ chưa kịp giải nén bị bỏ, không xếp hàng), giải nén bằng `esp_new_jpeg` ra RGB565 vào bộ đệm LVGL không vẽ, rồi đổi nguồn ảnh dưới khoá LVGL |
| `gw_relay` | 0 / 2 | Gửi khung lên Server khi có phiên xem từ xa (mục 3.2) |

Thông lượng = max(nhận, giải nén). Giải nén chỉ chạy khi LCD đang ở trang Camera. Ô hiển thị vẫn **448×336**: VGA 640×480 × 0,7 = 448×336, cả hai cạnh là bội của 8 nên bộ giải nén thu nhỏ trong chính lần giải nén (không bước co giãn riêng); QVGA (320×240) được giải nén nguyên kích thước rồi phóng lên bằng điểm gần nhất. Tuỳ chọn dự phòng TJpgDec: menuconfig → *Gateway S3: ui*.

Log mỗi 5 s để đo (ESP_LOGI):

```
gw_camera_live: rx <A> fps, <B> KB/s (<N> frames in <T> ms)           # nhận từ camera
gw_live_view: shown <C> fps, decode avg <D> ms (max <E>), submitted <N>, dropped <M> (replaced), failed 0, lvgl lock timeouts 0
gw_camera_relay: relay sent <F> fps, <G> KB/s, offered <N>, dropped <M>  # chỉ khi có phiên xem từ xa
```

(`<…>` là số đo thật khi chạy trên board; chưa có số đo nào được ghi lại.)

### 3.2. Nhãn "Đang được xem từ xa"

Server gửi lệnh MQTT `live_start` (command_id = session_id) tới camera → Gateway mở WebSocket TLS `/api/device/camera/live` và đẩy khung JPEG lên Server (≤ `CONFIG_GW_CAMERA_RELAY_MAX_FPS`, mặc định 15). Trong lúc phiên còn hiệu lực, trang Camera hiện nhãn "Đang được xem từ xa" (chấm đỏ trên nền đen mờ, góc trên trái khung hình, kể cả khi chưa có hình). Nhãn tắt khi `live_stop`, khi Server đóng, hoặc khi rớt mạng quá 3 lần nối lại (1, 2, 4 s). Rời trang Camera thì LCD không giải nén nữa nhưng luồng camera vẫn được kéo cho phiên xem từ xa. Chi tiết giao thức: README của Gateway, mục *Xem từ xa*.

- Trạng thái quạt / điều hoà / đèn / rèm đọc từ trường `fan`, `ac`, `ac_temp`, `lamp`, `curtain` trong telemetry của node — **đề xuất**, node chưa gửi (README Gateway, mục *Giao diện và xem trực tiếp*).

## 4. Chữ tiếng Việt

LVGL hiển thị được tiếng Việt nếu font có glyph; font Montserrat có sẵn của LVGL chỉ có ASCII. Gateway dùng font riêng `components/ui/fonts/gw_font_vi_16/20/24.c` (Montserrat Medium + biểu tượng LVGL, ASCII + `°` + 134 chữ cái tiếng Việt), sinh bằng `bash components/ui/fonts/gen_fonts.sh` (Node.js, `npx lv_font_conv@1.5.2`). Thêm ký tự mới thì sửa script rồi chạy lại. Ký tự ngoài bộ font không hiện đúng (ô vuông hoặc bị bỏ), nên chuỗi mới cần kiểm có nằm trong bộ font.

---

## 5. File đã đổi

### 5.1. Pipeline camera + xem từ xa (2026-11-13)

| File | Thay đổi |
|---|---|
| `components/services/src/gw_camera_live.c`, `include/gw_camera_live.h` | Chỉ đọc luồng (nhân 0); 4 bộ đệm khung PSRAM có đếm tham chiếu (`gw_live_frame_t`, `gw_live_frame_ref/release`); `on_frame` nhận con trỏ khung; log fps nhận |
| `components/services/src/gw_camera_relay.c`, `include/gw_camera_relay.h` | **Mới**: WebSocket TLS (`esp_transport_ssl` + `esp_transport_ws`) lên `/api/device/camera/live`, giới hạn fps, 1 khung chờ, status/end, nối lại 1/2/4 s |
| `components/services/src/gw_api.c`, `include/gw_api.h` | `gw_api_base_url()` để relay dựng URL cùng chính sách TLS |
| `components/services/Kconfig.projbuild`, `CMakeLists.txt` | `CONFIG_GW_CAMERA_RELAY_MAX_FPS` (1–25, mặc định 15); `tcp_transport` |
| `components/ui/src/gw_live_view.c/.h` | **Mới**: task `gw_decode`, ô chờ duy nhất, 2 bộ đệm RGB565, số đo |
| `components/ui/src/gw_jpeg_esp.c`, `gw_jpeg.h` | **Mới**: giải nén bằng `esp_new_jpeg` (scale hoặc bộ đệm phụ + co điểm gần nhất); API `gw_jpeg_create/decode_fit` |
| `components/ui/src/gw_jpeg_tjpgd.c` | Mã TJpgDec cũ (đổi tên từ `gw_jpeg.c`), dự phòng `CONFIG_GW_UI_JPEG_TJPGD` |
| `components/ui/src/gw_ui.c`, `include/gw_ui.h` | `gw_ui_live_submit` thay `gw_ui_live_frame`; `gw_ui_set_remote_view` + nhãn "Đang được xem từ xa" |
| `components/ui/idf_component.yml`, `Kconfig.projbuild`, `CMakeLists.txt` | Khai báo `espressif/esp_new_jpeg ^1.0.2`; chọn bộ giải nén |
| `components/application/src/gw_app.c`, `include/gw_app.h` | Lệnh camera `live_start`/`live_stop` (không ack); một luồng cho LCD + relay; `live_sync` theo (trang Camera) HOẶC (phiên relay) |
| `sdkconfig.defaults` | `CONFIG_LWIP_TCP_SND_BUF_DEFAULT` / `WND_DEFAULT` = 11520 (mặc định 5760 dễ nghẽn ở 0,3–0,6 MB/s) — chỉ áp dụng khi sinh lại `sdkconfig` |

### 5.2. Bảng Thiết bị (2026-11-09)

| File | Thay đổi |
|---|---|
| `components/ui/src/gw_ui.c` | Độ rộng cột mới; sửa lỗi xuống dòng (`on_table_draw_begin`); cột Trạng thái vẽ chấm (`on_table_draw_end`); chú thích 3 màu; cột Lần cuối hiện giờ (`fmt_last_seen`); nav / trang Camera / Phòng khách dùng 3 trạng thái |
| `components/ui/include/gw_ui.h` | `gw_ui_link_t` (3 trạng thái); `gw_ui_device_t` có `link`, `has_rssi`, `last_seen_ts` thay `online`, `seen_ago_s` |
| `components/services/src/gw_registry.c`, `include/gw_registry.h` | `last_seen_unix` trong trạng thái thiết bị; đọc/ghi NVS `seen` (`load_seen`, `gw_registry_save_seen`) |
| `components/application/src/gw_app.c` | `device_link()` tính 3 trạng thái; gọi `gw_registry_save_seen` mỗi 60 s và trước lệnh `restart` |

## 6. Kiểm tra

| Kiểm | Kết quả |
|---|---|
| `idf.py build` | Đạt, 0 cảnh báo; `gateway_s3.bin` 0x161B30 byte, slot OTA còn trống 77% |
| Nạp + khởi động (COM3) | Đạt: `gw_ui: UI ready (touch on)`, `gw_registry: 1 paired device(s)`, không lỗi NVS khi chưa có namespace `seen` |
| Chấm màu, chữ không xuống dòng, chú thích | Cần xem trên màn hình |
| Lưu "lần cuối" qua khởi động lại | **Chưa thử** (camera không cắm lúc nạp) |

Thử phần lưu "lần cuối" khi có camera:

1. Bật camera, đợi chấm **xanh**, ở lại ≥ 1 phút (lần ghi NVS đầu tiên diễn ra trong phút đầu).
2. Tắt camera. Sau ~90 s chấm chuyển **đỏ**, cột Lần cuối giữ giờ lúc tắt.
3. Rút nguồn / reset Gateway. Sau khi khởi động, chấm **vàng** trong 60 s đầu rồi **đỏ**; cột Lần cuối vẫn hiện giờ ở bước 2.
4. Bật lại camera: chấm vàng → xanh, cột Lần cuối chạy theo giờ hiện tại.
