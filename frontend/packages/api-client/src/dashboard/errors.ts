import { FetchError } from "../errors";
import { apiErrorCode } from "../http";

// ---------------------------------------------------------------------------
// NFR-U2: mã lỗi backend (`{ error: "UPPER_SNAKE" }`) → câu tiếng Việt nói rõ
// người dùng cần làm gì tiếp. Không bao giờ hiển thị mã thô. Trang có ngữ cảnh
// riêng truyền `overrides` (theo mã lỗi hoặc theo HTTP status dạng "413").
// ---------------------------------------------------------------------------

const MESSAGES: Record<string, string> = {
  // Kết nối / phản hồi
  NETWORK_ERROR: "Không kết nối được tới máy chủ. Kiểm tra mạng (hoặc backend đã chạy chưa) rồi thử lại.",
  INVALID_RESPONSE: "Máy chủ trả về dữ liệu không đọc được. Tải lại trang; nếu vẫn lỗi, báo cho quản trị hệ thống.",
  INTERNAL_ERROR: "Máy chủ đang gặp sự cố. Thử lại sau ít phút; nếu vẫn lỗi, báo cho quản trị hệ thống.",
  TIMEOUT: "Thiết bị không phản hồi kịp. Kiểm tra Gateway còn online rồi thử lại.",

  // Phiên & quyền
  NO_TOKEN: "Phiên đăng nhập đã hết. Vui lòng đăng nhập lại.",
  INVALID_TOKEN: "Phiên đăng nhập không còn hợp lệ. Vui lòng đăng nhập lại.",
  TOKEN_EXPIRED: "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.",
  ACCOUNT_LOCKED: "Tài khoản đã bị khoá. Liên hệ Admin để được mở khoá.",
  CSRF_CHECK_FAILED: "Yêu cầu bị chặn vì lý do bảo mật. Tải lại trang rồi thử lại.",
  USE_MOBILE_APP: "Tài khoản khách hàng chỉ dùng được trên ứng dụng Smart Home.",
  WRONG_PORTAL: "Tài khoản này thuộc cổng khác. Đăng nhập tại đúng cổng của vai trò bạn.",
  FORBIDDEN: "Bạn không có quyền thực hiện thao tác này. Liên hệ Admin nếu cần được cấp quyền.",
  ACCESS_GRANT_REQUIRED:
    "Nhà này đã được khách hàng kích hoạt — cần quyền truy cập có thời hạn. Mở trang Smart Home và bấm “Yêu cầu quyền truy cập”.",

  // Dữ liệu đầu vào
  MISSING_FIELDS: "Còn thiếu thông tin bắt buộc. Điền đủ các trường rồi thử lại.",
  INVALID_INPUT: "Dữ liệu nhập chưa hợp lệ. Kiểm tra lại các trường rồi thử lại.",
  PAYLOAD_TOO_LARGE: "File quá lớn (tối đa 4 MB). Kiểm tra lại file firmware .bin.",

  // Nghiệp vụ
  NOT_FOUND: "Không tìm thấy dữ liệu — có thể đã bị xoá. Tải lại trang rồi thử lại.",
  ALREADY_CLAIMED: "Nhà này đã có chủ sở hữu nên không thể thực hiện thao tác này. Tải lại trang để xem trạng thái mới.",
  CUSTOMER_NOT_FOUND: "Không tìm thấy khách hàng với User ID này. Kiểm tra lại (VD: dat#4821) hoặc nhờ khách xem trong mục Hồ sơ của ứng dụng.",
  HOME_SUSPENDED: "Nhà đang bị tạm ngưng nên không thực hiện được. Kích hoạt lại nhà trước.",
  DEVICE_OFFLINE: "Thiết bị đang offline. Kiểm tra nguồn và kết nối của thiết bị rồi thử lại.",
  DEVICE_BLOCKED: "Thiết bị đang bị khoá. Mở khoá thiết bị trước rồi thử lại.",
  NOT_CONTROLLABLE: "Thiết bị này không điều khiển bật/tắt được.",
  NOT_SIMULATED: "Thiết bị này là phần cứng thật — không dùng được bộ mô phỏng.",
  VERSION_EXISTS: "Phiên bản firmware này đã tồn tại cho loại thiết bị đã chọn. Đặt số phiên bản mới rồi tải lên lại.",
  NO_TARGETS: "Không có thiết bị nào thuộc phạm vi đã chọn. Chọn phạm vi hoặc nhà khác.",
  USERNAME_TAKEN: "Tên đăng nhập đã được dùng. Chọn tên khác.",
  INVALID_CREDENTIALS: "Thông tin đăng nhập không đúng. Kiểm tra lại rồi thử lại.",

  // Giới hạn tần suất
  TOO_MANY_REQUESTS: "Bạn thao tác quá nhanh. Đợi một lát rồi thử lại.",
  RATE_LIMITED: "Bạn thao tác quá nhanh. Đợi một lát rồi thử lại.",
};

const STATUS_FALLBACK: Record<number, string> = {
  0: MESSAGES.NETWORK_ERROR,
  401: "Phiên đăng nhập đã hết. Vui lòng đăng nhập lại.",
  403: MESSAGES.FORBIDDEN,
  404: MESSAGES.NOT_FOUND,
  409: "Dữ liệu vừa thay đổi nên thao tác không còn phù hợp. Tải lại trang rồi thử lại.",
  410: "Dữ liệu này đã hết hạn. Tải lại trang để xem trạng thái mới.",
  413: MESSAGES.PAYLOAD_TOO_LARGE,
  429: MESSAGES.TOO_MANY_REQUESTS,
  504: MESSAGES.TIMEOUT,
};

export type ErrorOverrides = Partial<Record<string, string>>;

export function errorStatus(err: unknown): number | null {
  return err instanceof FetchError ? err.status : null;
}

export function isErrorCode(err: unknown, code: string): boolean {
  return apiErrorCode(err) === code;
}

export function isAccessGrantRequired(err: unknown): boolean {
  return apiErrorCode(err) === "ACCESS_GRANT_REQUIRED";
}

export function isNotFound(err: unknown): boolean {
  return errorStatus(err) === 404;
}

/** Câu hướng dẫn tiếng Việt cho lỗi bất kỳ (API, mạng, lỗi JS). */
export function errorMessage(err: unknown, overrides?: ErrorOverrides): string {
  const code = apiErrorCode(err);
  const status = errorStatus(err);

  if (code && overrides?.[code]) return overrides[code];
  if (status !== null && overrides?.[String(status)]) return overrides[String(status)]!;
  if (code && MESSAGES[code]) return MESSAGES[code];

  if (status !== null) {
    if (STATUS_FALLBACK[status]) return STATUS_FALLBACK[status];
    if (status >= 500) return MESSAGES.INTERNAL_ERROR;
    return "Yêu cầu không thực hiện được. Kiểm tra lại thông tin rồi thử lại.";
  }
  return "Đã có lỗi không mong muốn. Tải lại trang rồi thử lại.";
}
