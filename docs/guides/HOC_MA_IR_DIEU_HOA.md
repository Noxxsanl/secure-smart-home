# Học mã hồng ngoại để điều khiển điều hòa

> Hiện trạng code (2026-11-12). Node phòng khách (`firmware/esp32_s3_firmware_node`) dùng mắt thu **VS1838B** để thu tín hiệu remote điều hòa, lưu vào NVS, rồi phát lại bằng **LED hồng ngoại 5 mm 940 nm**. Khi đã học mã, bạn điều khiển điều hòa được ở 3 chỗ: màn TFT của Node, web app khách hàng (`frontend/apps/user`) và màn hình Gateway (Gateway chỉ hiển thị trạng thái).

## 1. Remote điều hòa gửi gì

Hồng ngoại của remote là ánh sáng 940 nm được **bật/tắt rất nhanh ở 38 kHz** (sóng mang). Dữ liệu nằm ở việc sóng mang đang **có** (mark) hay **không có** (space), và mỗi đoạn kéo dài bao lâu:

```
 sóng mang 38 kHz:  ||||||||||||||||          ||||  ||||    ||||        ||||  ...
 VS1838B (OUT):     ‾‾\________________/‾‾‾‾‾‾‾‾\____/‾‾\____/‾‾‾‾\____/‾‾‾‾‾‾‾‾‾\____/ ...
                       header mark       header   bit 0       bit 1
                       ~3–9 ms           space    (space ngắn) (space dài ~1,3–1,7 ms)
```

- **VS1838B đã giải điều chế sẵn.** Chân OUT xuống mức THẤP khi có sóng 38 kHz và lên CAO khi im lặng. ESP32 chỉ cần đo độ dài từng đoạn thấp/cao, không phải đo 38 kHz.
- **Mã điều hòa khác mã TV.** Remote TV gửi "phím Volume+". Remote điều hòa mỗi lần bấm lại gửi **toàn bộ trạng thái** (bật/tắt, chế độ, nhiệt độ, tốc độ quạt, swing, giờ hẹn…) trong 1–3 khung dài, thường 100–300 bit. Không có lệnh "tăng 1 độ". Bấm `+` trên remote thực chất là gửi lại cả trạng thái mới, kèm nhiệt độ mới.
- Vì vậy Node **học mã thô** (raw): ghi lại nguyên chuỗi độ dài mark/space, rồi phát lại y hệt. Cách này không cần biết hãng hay giao thức (Daikin, Panasonic, LG…). Đổi lại, mỗi trạng thái muốn dùng phải học riêng.

Node học 16 mã:

| Ô trên màn hình | Khoá NVS (`ir_codes`) | Bấm remote thế nào khi học |
|---|---|---|
| TẮT | `ac_off` | Điều hòa đang bật, bấm nút nguồn để tắt |
| 16°C … 30°C | `ac_t16` … `ac_t30` | Chỉnh remote về chế độ **Lạnh**, quạt Auto, đúng nhiệt độ của ô, rồi bấm (thường bấm nút nguồn hoặc nút nhiệt độ) |

Không cần học đủ 16 mã. Mức nhiệt nào chưa học thì lệnh tới mức đó báo lỗi kèm hướng dẫn học. Mỗi mã chiếm khoảng 0,5–2 KB trong phân vùng `nvs` 64 KB, nên đủ chỗ cho 16 mã.

## 2. Đấu dây

| Linh kiện | Chân | Nối vào | Ghi chú |
|---|---|---|---|
| VS1838B | OUT | **GPIO1** | Mặc định trong menuconfig |
| | GND | GND | |
| | VCC | **3V3** | Không cấp 5 V, vì khi đó OUT lên 5 V và quá áp chân ESP32-S3. Nên thêm trở 100 Ω nối tiếp vào VCC và tụ 4,7 µF từ VCC xuống GND để lọc nhiễu |
| LED IR 940 nm | Anode (chân dài) | **GPIO2** qua trở, hoặc qua transistor (xem dưới) | Mặc định trong menuconfig |
| | Cathode (chân ngắn) | GND (hoặc cực C của transistor) | |

Hai cách cấp dòng cho LED:

- **Thử nhanh:** GPIO2 → trở 100 Ω → LED → GND. Dòng khoảng 15 mA nên chỉ phát xa chừng 1 m. Đủ khi đặt Node sát điều hòa.
- **Dùng thật:** dùng transistor NPN (S8050/2N2222). GPIO2 → trở 1 kΩ → cực B; 5V → trở 22–47 Ω → LED → cực C; cực E nối GND. Dòng xung khoảng 100 mA, phát xa vài mét. Cách đấu này vẫn "GPIO cao = LED sáng", nên để **tắt** tuỳ chọn "LED sáng khi chân ở mức THẤP".

Đổi chân trong `idf.py menuconfig` → **Node S3: hồng ngoại (điều hòa)**. Code đọc chân ở `components/board/src/board_ir.c`; đây là nơi duy nhất trong code biết số chân.

Mẹo: LED IR không nhìn thấy bằng mắt thường. Muốn biết LED có phát không, nhìn nó qua camera điện thoại (thường là camera trước) và bấm phát thử: LED sẽ nháy tím.

## 3. Học mã trên màn Node

1. Nạp firmware Node (`idf.py build flash monitor` trong `firmware/esp32_s3_firmware_node`).
2. Chạm ô **Điều hòa** (ngoài công tắc) để mở bảng Điều hòa, rồi bấm **Học mã**.
3. Chạm một ô, ví dụ **26°C**. Ô nháy viền vàng, dòng chữ hướng dẫn chuyển vàng và thanh đếm ngược 10 giây chạy ở đáy màn hình.
4. Cầm remote cách mắt thu VS1838B khoảng 5–20 cm. Chỉnh remote về Lạnh, 26°C, rồi bấm **một lần, nhả ra** (giữ nút lâu thì mã có thể dài quá bộ nhớ thu).
5. Học được thì ô chuyển xanh kèm dấu ✓ và dòng chữ báo "Đã học mã 26°C: N khung, M xung". **Giữ lâu** ô có dấu ✓ để phát thử. Điều hòa phải kêu "bíp" và chuyển đúng trạng thái.
6. Lặp lại cho ô **TẮT** và các mức nhiệt bạn hay dùng. Học lại một ô thì mã mới ghi đè mã cũ.
7. Bấm **Quay lại** để về bảng điều khiển. Ở đó có công tắc **Nguồn** (bật = phát mã của nhiệt độ đang đặt, tắt = mã TẮT), nút `-` / `+` và thanh kéo 16–30°C. Chỉnh liên tục thì Node chờ 600 ms sau lần chỉnh cuối mới phát một lần. Mức chưa học mã hiện số màu vàng và không phát gì. Công tắc trên ô Điều hòa ở màn hình chính làm cùng việc với công tắc Nguồn.

Trong lúc đang học (tối đa 10 giây), lệnh từ web bị từ chối để mắt thu không bị LED của chính Node làm nhiễu.

### Đọc mã trong log

Mỗi mã học xong được in ra log (`idf.py monitor`). Cách đọc:

```
I node_ac: IR code ac_t26: 583 durations, 2 frame(s), header mark 3480 us / space 1720 us, ~144 bits
I node_ac:   [  0] 3480 1720 450 1300 450 420 450 420 450 1300 450 420 450 420 450 420 
I node_ac:   [ 16] 450 1300 450 420 ...
```

- Các số là µs, xen kẽ **mark, space, mark, space…**, bắt đầu bằng mark.
- Cặp đầu là **header**: ví dụ 3480/1720 µs là kiểu header của Panasonic/Daikin, 9000/4500 µs là kiểu NEC.
- Sau header, mỗi cặp (mark ~450 µs, space) là **1 bit**: space ngắn (~420 µs) là 0, space dài (~1300 µs) là 1.
- Một space rất dài (≈ 10–35 ms) ở giữa chuỗi là **khoảng nghỉ giữa 2 khung**. Mắt thu tự gộp các khung cách nhau dưới 30 ms. Khung cách xa hơn thì Node ghép lại và ước lượng khoảng nghỉ (`capture()` trong `node_ac.c`).
- So sánh mã 25°C với 26°C: chỉ vài bit ở giữa khác nhau (vài bit nhiệt độ cùng byte checksum ở cuối khung). Đây là cách giải mã giao thức nếu sau này muốn sinh mã cho mọi nhiệt độ mà không phải học từng mức.

## 4. Điều khiển từ web app và Gateway

Trang chi tiết điều hòa trên web app `user` có các phần giống màn Node:
- Nút BẬT / TẮT.
- Nhiệt độ cỡ lớn với − / +.
- Lưới 16 mã (TẮT, 16..30°C). Ô đã học nổi bật, bấm vào để phát mã đó. Ô chưa học bị mờ.
- Chế độ **Học mã**: bấm một ô, web đếm ngược 10 giây; trong lúc đó bạn chĩa remote vào mắt thu của Node và bấm. Request chỉ trả về **sau khi** Node đã thu và lưu xong (hoặc báo lỗi), nên web báo đúng "đã học" hay "không thu được".

Web biết mã nào đã học nhờ telemetry `ac_codes` của Node (bitmask: bit 0 = TẮT, bit t−15 = t°C), được lưu vào `devices.ac_codes`.

```
Học mã từ web:
  POST /api/portal/devices/:id/commands {action:"learn_code", slot:24}
  → MQTT .../device/<node_id>-ac/command {action:"learn_t24"}   (TẮT: learn_off)
  → Gateway → ESP-NOW CMD → Node chờ remote ≤ 10 s, lưu NVS → CMD_ACK ok/lỗi
  (Gateway chờ ack 14 s, Backend 15 s cho riêng lệnh learn_*; lệnh khác 3 s / 5 s)
  → Backend bật bit vào ac_codes → web hiện ô 24°C đã học
```

```
Web user (thẻ Điều hòa: Bật/Tắt, − 26°C +)
  → POST /api/portal/devices/:id/commands {action:"set_temp", temperature:26}
  → Backend: MQTT home/<home>/gateway/<gw>/device/<node_id>-ac/command {action:"set_temp_26", ts, hmac}
  → Gateway: kiểm HMAC, tách "<node_id>-ac" → node <node_id>, ESP-NOW CMD {action, params:{target:"ac"}, ts}
  → Node: phát mã ac_t26 → CMD_ACK {status:"ok", power:true}
  → Gateway: ack về topic .../device/<node_id>-ac/command/ack → Backend lưu power_state + ac_setpoint → web cập nhật
```

- Chuẩn bị Backend: khởi động backend để tự áp migration (`devices.appliance`, `devices.ac_setpoint`), rồi chạy lại `npm run hw:register` ([LEN_SERVER](LEN_SERVER.md)). Lệnh này chuyển dòng `<node_id>-ac` từ **mô phỏng** sang **thiết bị thật**. Đèn, quạt, rèm cũng là thiết bị thật từ 2026-11-13 (relay + động cơ bước, [README của Node](../../firmware/esp32_s3_firmware_node/README.md)).
- Điều hòa được tính **online theo Node**: mỗi gói TELEMETRY của Node (10 giây/lần) cập nhật `last_seen` của dòng `-ac`. Node chưa gửi được gói nào (chưa ghép nối Gateway, hoặc SHT31 lỗi) thì web báo điều hòa offline.
- Khi bấm trên màn Node, Node gửi telemetry ngay với `ac` (0/1) và `ac_temp`. Backend đồng bộ vào dòng `-ac`, nên web và trang Living Room của Gateway cùng cập nhật.
- Lỗi "Điều hòa chưa nhận lệnh" trên web thường nghĩa là Node chưa học mã cho mức nhiệt đó.

## 5. Giới hạn

- Node không biết điều hòa **thực sự** đã nhận lệnh hay chưa (IR chỉ đi một chiều). "BẬT/TẮT" trên màn hình và web là trạng thái **Node đã phát**. Nếu ai đó dùng remote thật, trạng thái sẽ lệch cho tới lần điều khiển kế tiếp.
- Sau khi khởi động lại, Node chưa biết trạng thái điều hòa (hiện "--") cho tới lần phát đầu tiên. Nhiệt độ đặt quay về 26°C.
- Mới chỉ có chế độ Lạnh. Muốn thêm chế độ Quạt / Khô / Sưởi thì cần thêm ô học và action mới ở cả 4 tầng.
- Sóng mang mặc định là 38 kHz, vì VS1838B không đo được tần số sóng mang. Vài hãng dùng 36–40 kHz, vẫn thường chạy được ở 38 kHz.
- Cảm ứng của màn Node phải hoạt động thì mới học mã trên TFT được ([MAN_HINH_NODE](MAN_HINH_NODE.md), mục hiệu chuẩn cảm ứng).
