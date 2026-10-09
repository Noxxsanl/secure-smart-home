import { apiErrorCode } from "@smarthome/shared/api/http";
import { FetchError } from "@smarthome/shared/api/errors";

// ---------------------------------------------------------------------------
// NFR-U2 / bất biến #10: mọi lỗi hiển thị câu hướng dẫn tiếng Việt, không bao
// giờ hiện mã thô. Bảng dưới phủ mọi mã lỗi mà cổng khách hàng có thể nhận
// (CONTRACT §0, §2, §4); mã lạ rơi về thông điệp theo HTTP status.
// ---------------------------------------------------------------------------

const MESSAGES: Record<string, string> = {
  // Chung / kết nối
  NETWORK_ERROR: "Không kết nối được máy chủ. Kiểm tra kết nối mạng rồi thử lại.",
  INVALID_RESPONSE: "Máy chủ trả về dữ liệu không đọc được. Vui lòng tải lại trang; nếu vẫn lỗi, hãy liên hệ bộ phận hỗ trợ.",
  MISSING_FIELDS: "Còn thiếu thông tin bắt buộc. Vui lòng điền đủ các trường rồi thử lại.",
  INVALID_INPUT: "Thông tin chưa hợp lệ. Vui lòng kiểm tra lại các trường đã nhập.",
  TOO_MANY_REQUESTS: "Bạn thao tác quá nhanh. Vui lòng đợi một lát rồi thử lại.",
  CSRF_CHECK_FAILED: "Yêu cầu bị từ chối vì lý do bảo mật. Vui lòng tải lại trang rồi thử lại.",
  // Phiên đăng nhập
  NO_TOKEN: "Bạn chưa đăng nhập hoặc phiên đã kết thúc. Vui lòng đăng nhập lại.",
  INVALID_TOKEN: "Phiên đăng nhập không còn hợp lệ. Vui lòng đăng nhập lại.",
  TOKEN_EXPIRED: "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.",
  ACCOUNT_LOCKED: "Tài khoản đã bị khoá. Vui lòng liên hệ bộ phận hỗ trợ khách hàng.",
  USE_DASHBOARD: "Tài khoản nhân viên không dùng được cổng khách hàng. Vui lòng đăng nhập ở cổng quản trị.",
  WRONG_PORTAL: "Tài khoản này không thuộc cổng khách hàng. Vui lòng đăng nhập ở đúng cổng.",
  // Quyền theo nhà (bất biến #6: ngoài nhà → 404, sai role → 403)
  FORBIDDEN: "Vai trò của bạn trong nhà này không cho phép thao tác này. Hãy nhờ chủ nhà (Owner) cấp quyền.",
  NOT_FOUND: "Không tìm thấy dữ liệu, hoặc bạn không còn là thành viên của nhà này. Hãy tải lại trang.",
  // Điều khiển thiết bị (FR-5.3, 5.5, 5.9)
  TIMEOUT: "Thiết bị không xác nhận kịp nên trạng thái đã được khôi phục. Kiểm tra thiết bị rồi thử lại.",
  NOT_CONTROLLABLE: "Thiết bị này chỉ đo đạc, không bật/tắt được.",
  DEVICE_OFFLINE: "Thiết bị đang offline nên không nhận lệnh. Kiểm tra nguồn điện và WiFi của thiết bị rồi thử lại.",
  DEVICE_BLOCKED: "Thiết bị đã bị khoá vì lý do bảo mật. Liên hệ bộ phận hỗ trợ để được kiểm tra.",
  HOME_SUSPENDED: "Dịch vụ của nhà này đang tạm ngưng nên chưa điều khiển hay đổi tự động hoá được. Liên hệ bộ phận hỗ trợ.",
  // Thành viên (FR-6.x)
  CANNOT_INVITE_SELF: "Bạn không thể tự mời chính mình. Hãy nhập email của người cần mời.",
  ALREADY_MEMBER: "Người này đã là thành viên hoặc đang có lời mời chờ chấp nhận.",
  OWNER_CANNOT_LEAVE: "Chủ nhà không thể rời khỏi nhà của mình.",
  // Tự động hoá & gợi ý
  ALREADY_RESPONDED: "Gợi ý này đã được xử lý trước đó. Danh sách sẽ được làm mới.",
  // Tài khoản
  INVALID_CREDENTIALS: "Mật khẩu hiện tại không đúng. Vui lòng nhập lại.",
  EMAIL_TAKEN: "Email này đã được đăng ký cho một tài khoản khác.",
  // Claim — thông điệp chung; luồng claim dùng CLAIM_MESSAGES chi tiết hơn
  ALREADY_USED: "Mã này đã được sử dụng.",
  EXPIRED: "Mã hoặc lời mời đã hết hạn.",
  RATE_LIMITED: "Bạn đã thử quá nhiều lần. Vui lòng đợi một lát rồi thử lại.",
};

// FR-3.5 — thông điệp riêng cho luồng kích hoạt bằng Activation Code.
const CLAIM_MESSAGES: Record<string, string> = {
  NOT_FOUND: "Mã kích hoạt không đúng. Kiểm tra lại 12 ký tự trên tem dán ở hộp Gateway.",
  ALREADY_USED: "Mã này đã được dùng để kích hoạt một nhà. Nếu bạn vừa mua kit, hãy liên hệ nơi bán để được hỗ trợ.",
  EXPIRED: "Mã kích hoạt đã hết hạn hoặc đã bị thu hồi. Liên hệ bộ phận hỗ trợ để được cấp mã mới.",
  INVALID_INPUT: "Activation Code gồm 12 ký tự (dạng XXXX-XXXX-XXXX). Vui lòng kiểm tra lại.",
  TOO_MANY_REQUESTS: "Bạn đã thử kích hoạt quá nhiều lần trong giờ qua. Vui lòng đợi rồi thử lại.",
};

function isAbortError(err: unknown): boolean {
  return err instanceof DOMException && err.name === "AbortError";
}

function messageForStatus(status: number): string {
  if (status === 0) return MESSAGES.NETWORK_ERROR;
  if (status === 401) return MESSAGES.TOKEN_EXPIRED;
  if (status === 403) return MESSAGES.FORBIDDEN;
  if (status === 404) return MESSAGES.NOT_FOUND;
  if (status === 409) return "Dữ liệu vừa thay đổi. Vui lòng tải lại trang rồi thử lại.";
  if (status === 410) return "Dữ liệu này đã hết hạn. Vui lòng tải lại trang.";
  if (status === 413) return "Dữ liệu gửi lên quá lớn.";
  if (status === 429) return MESSAGES.TOO_MANY_REQUESTS;
  // Backend tắt / khởi động lại: Next rewrites hoặc nginx trả 5xx kèm thân không phải JSON.
  if (status === 502 || status === 503) return "Máy chủ tạm thời không phản hồi. Vui lòng thử lại sau ít phút.";
  if (status === 504) return "Máy chủ phản hồi quá lâu. Vui lòng thử lại.";
  if (status >= 500) return "Hệ thống đang gặp sự cố. Vui lòng thử lại sau ít phút.";
  return "Không thực hiện được thao tác. Vui lòng thử lại.";
}

/** Thông điệp tiếng Việt cho lỗi bất kỳ; `overrides` cho phép đổi câu theo ngữ cảnh. */
export function portalErrorMessage(err: unknown, overrides?: Record<string, string>): string {
  // Client tự huỷ request khi quá thời gian chờ (lệnh thiết bị 8 s).
  if (isAbortError(err)) return overrides?.TIMEOUT ?? MESSAGES.TIMEOUT;
  if (!(err instanceof FetchError)) return "Đã có lỗi không mong muốn. Vui lòng tải lại trang rồi thử lại.";
  const code = apiErrorCode(err);
  // INVALID_RESPONSE kèm lỗi HTTP (VD 502 từ proxy) chỉ nói "thân phản hồi không phải JSON" — câu theo status rõ hơn.
  if (code && !(code === "INVALID_RESPONSE" && err.status >= 400)) {
    const message = overrides?.[code] ?? MESSAGES[code];
    if (message) return message;
  }
  return messageForStatus(err.status);
}

/** Lỗi khi bật/tắt relay — dùng cho toast hoàn tác (FR-5.3). */
export function commandErrorMessage(err: unknown): string {
  return portalErrorMessage(err);
}

/** `retry_after_seconds` của lỗi 429 RATE_LIMITED (FR-3.6); null nếu không có. */
export function retryAfterSeconds(err: unknown): number | null {
  if (!(err instanceof FetchError)) return null;
  const value = (err.data as { retry_after_seconds?: unknown } | null)?.retry_after_seconds;
  return typeof value === "number" && value > 0 ? value : null;
}

/** FR-3.5: NOT_FOUND / ALREADY_USED / EXPIRED / RATE_LIMITED kèm hướng xử lý. */
export function claimErrorMessage(err: unknown): string {
  if (apiErrorCode(err) === "RATE_LIMITED") {
    const seconds = retryAfterSeconds(err);
    const minutes = seconds ? Math.max(1, Math.ceil(seconds / 60)) : 15;
    return `Bạn đã nhập sai quá nhiều lần. Vui lòng đợi khoảng ${minutes} phút rồi thử lại.`;
  }
  return portalErrorMessage(err, CLAIM_MESSAGES);
}

/** Chi tiết một lần chạy rule (automation_history.details) → câu ngắn, không mã thô. */
export function historyDetailText(details: Record<string, unknown> | null): string | null {
  if (!details) return null;
  for (const field of ["error", "reason", "error_code", "code"]) {
    const value = details[field];
    // Engine ghi mã lý do (VD DEVICE_OFFLINE / device_offline) — dịch sang câu tiếng Việt, mã lạ thì bỏ qua.
    if (typeof value === "string" && MESSAGES[value.toUpperCase()]) return MESSAGES[value.toUpperCase()];
  }
  const message = details.message;
  if (typeof message === "string" && message.trim() && !/^[A-Z0-9_]+$/.test(message)) return message;
  return null;
}

export function isForbidden(err: unknown): boolean {
  return err instanceof FetchError && err.status === 403;
}

export function isNotFound(err: unknown): boolean {
  return err instanceof FetchError && err.status === 404;
}
