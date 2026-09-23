# 12_PRODUCT_BRIEF.md

> **Product Brief — Secure Smart Home Platform**
> Bản tóm tắt sản phẩm 1 trang cho người đọc cần nắm nhanh: giảng viên hướng dẫn, hội đồng, thành viên mới.
> Chi tiết yêu cầu xem [`13_PRD_SMART_HOME.md`](13_PRD_SMART_HOME.md). Chi tiết kiến trúc xem các tài liệu `00`–`10`.

| | |
|---|---|
| **Đề tài** | Thiết kế và xây dựng hệ thống nhà thông minh an toàn dựa trên IoT |
| **Loại dự án** | Đồ án tốt nghiệp, định hướng sản phẩm thương mại |
| **Phiên bản mục tiêu** | V2 — MVP thương mại đầy đủ vòng đời (xem [`10_SMART_HOME_PRODUCT_ROADMAP.md`](10_SMART_HOME_PRODUCT_ROADMAP.md)) |
| **Cập nhật** | 2026-09-24 |

---

## 1. Vấn đề

Nhiều hệ thống Smart Home tự phát triển (kể cả bản Prototype hiện tại của dự án) đang là **trình quản lý thiết bị**, chưa phải **sản phẩm cho gia đình**:

- **Mô hình dữ liệu sai đối tượng.** Hệ thống quản lý "thiết bị mạng" (Gateway/Sensor gộp chung một bảng) chứ không quản lý "căn nhà → phòng → thiết bị". Không có khách hàng, không có chủ nhà, không có thành viên gia đình.
- **Không có đường đi từ hộp sản phẩm tới tay khách hàng.** Khách chưa có cách tự kích hoạt (claim) bộ kit đã mua, cũng chưa có cách tự nhập WiFi cho thiết bị. Hiện WiFi và secret đang được viết cứng trong firmware.
- **Bảo mật mới làm một nửa.** Xác thực HMAC 2 lớp đã đúng thuật toán, nhưng MQTT chưa có TLS và API đang để lộ secret của sensor cho mọi gateway đã đăng nhập.
- **Chưa có ứng dụng cho khách hàng.** Mobile App mới là giao diện mẫu, chưa gọi API thật.

## 2. Giải pháp

Một **nền tảng Smart Home có kênh truy cập tách riêng theo vai trò**. Nền tảng quản lý trọn vòng đời sản phẩm: nhập kho → đóng gói kit → bán → khách kích hoạt → sử dụng → bảo hành.

```
 Operator (Web)            Khách hàng (Mobile)            Thiết bị (ESP32)
 ──────────────            ───────────────────            ────────────────
 Tạo Smart Home  ──QR──▶   Quét QR, claim nhà     ◀──▶   Gateway ── ESP-NOW ── Nodes
 (unclaimed)               Nhập WiFi 1 lần (BLE)          HMAC 2 lớp + MQTT TLS
 Theo dõi, OTA, hỗ trợ     Điều khiển, cảnh báo,
                           mời thành viên, tự động hoá
```

**Ba nguyên tắc sản phẩm cốt lõi:**

1. **Khách hàng chỉ dùng Mobile App. Web Dashboard chỉ dành cho Admin/Operator.** Hai kênh dùng hai cơ chế xác thực và hai namespace API riêng.
2. **Smart Home được tạo trước khi bán.** Khách không phải "thêm thiết bị" mà chỉ "mở khoá" căn nhà đã cấu hình sẵn bằng QR hoặc Activation Code.
3. **Bảo mật từ thiết bị đến ứng dụng.** HMAC 2 lớp, MQTT TLS, secret không bao giờ đi tới Mobile, mọi hành động nhạy cảm đều được ghi log.

## 3. Người dùng mục tiêu

| Persona | Kênh | Nhu cầu chính |
|---|---|---|
| **Chủ hộ** (USER / OWNER) | Mobile | Cài đặt nhanh không cần kỹ thuật, điều khiển từ xa, nhận cảnh báo, chia sẻ quyền cho gia đình |
| **Thành viên gia đình** (CONTROLLER / VIEWER / GUEST) | Mobile | Dùng thiết bị trong phạm vi được cấp quyền |
| **Operator** (nhân viên vận hành) | Web | Chuẩn bị kit, theo dõi thiết bị, cập nhật firmware, hỗ trợ khách hàng |
| **Admin** | Web | Quản trị hệ thống, nhân sự, kho, firmware, audit |

## 4. Phạm vi V2 (đồ án)

| Bắt buộc chạy thật (MUST) | Cố gắng demo (SHOULD) | Chỉ trình bày thiết kế (COULD / WON'T) |
|---|---|---|
| Mô hình Home → Room → Device → Sensor → Telemetry | WiFi Provisioning (BLE hoặc SoftAP) | Camera live stream |
| RBAC 2 tầng: hệ thống + theo từng nhà | Gateway ↔ Node pairing qua ESP-NOW | Feature Store, Recommendation Engine đầy đủ |
| Claim Smart Home qua QR / Activation Code trên Mobile | OTA firmware (ít nhất 1 lần thành công) | Secure Boot, Flash Encryption |
| Điều khiển đèn/quạt + xem cảm biến trên Mobile | Push notification (sự kiện thiết bị offline) | Energy Analytics, Voice, Matter/Thread |
| HMAC 2 lớp + **MQTT TLS** + vá lộ secret | Tự động hoá IF/THEN, mời thành viên | Kubernetes, Kafka, Multi-Region |
| Admin Dashboard với dữ liệu thật | **Gợi ý tự động hoá theo thói quen (AI cơ bản)** | |

> Hai điểm điều chỉnh so với roadmap `10` được giải thích ở PRD mục 11: **MQTT TLS** được nâng lên MUST, và **AI gợi ý thói quen** được đưa vào SHOULD. Lý do là cả hai đều nằm trong nội dung đề tài đã đăng ký.

## 5. Tiêu chí thành công

- Người dùng mới đi từ **mở hộp đến điều khiển được thiết bị đầu tiên trong ≤ 10 phút**, không cần tài liệu hướng dẫn.
- **0 endpoint** trả secret thiết bị cho client. **100% lượt claim** (thành công và thất bại) được ghi log.
- Demo end-to-end trước hội đồng chạy trên **phần cứng thật**: Operator tạo nhà → khách claim → điều khiển relay → nhận cảnh báo.
- Toàn bộ lưu lượng MQTT Gateway ↔ Backend được mã hoá TLS.

## 6. Rủi ro chính

| Rủi ro | Hướng xử lý |
|---|---|
| Phạm vi V2 quá lớn so với thời gian đồ án | Giữ chặt MoSCoW. SHOULD trượt thì chuyển thành "trình bày thiết kế" |
| Phần cứng (relay, camera) chưa sẵn sàng | Simulator gửi MQTT đúng payload cho phần thiếu phần cứng |
| Hội đồng hỏi phần chưa làm (AI, Matter…) | Trả lời bằng tài liệu kiến trúc `03` §18 và `04` §7.12 |

## 7. Tài liệu liên quan

- **PRD chi tiết:** [`13_PRD_SMART_HOME.md`](13_PRD_SMART_HOME.md)
- **Kiến trúc sản phẩm và Claim:** [`01`](01_SMART_HOME_PRODUCT_ARCHITECTURE.md) · **Provisioning:** [`02`](02_SMART_HOME_WIFI_PROVISIONING.md)
- **Backend:** [`03`](03_BACKEND_REFACTOR_SMARTHOME.md) · **Database:** [`04`](04_DATABASE_REFACTOR_SMARTHOME.md) · **Dashboard:** [`05`](05_FRONTEND_REFACTOR_SMARTHOME.md) · **Mobile:** [`07`](07_MOBILE_APP_ARCHITECTURE.md) · **Firmware:** [`08`](08_EMBEDDED_ARCHITECTURE_ESP_IDF.md) · **Security:** [`09`](09_SECURITY_ARCHITECTURE.md) · **Roadmap:** [`10`](10_SMART_HOME_PRODUCT_ROADMAP.md)
