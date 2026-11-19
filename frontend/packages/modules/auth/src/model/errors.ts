import { apiErrorCode, FetchError } from "@shh/api-client";
import { PORTAL_LABELS, type UserRole } from "./types";

// ---------------------------------------------------------------------------
// Thông điệp lỗi đăng nhập / đăng ký (NFR-U2: nói rõ cần làm gì, không mã thô).
// ---------------------------------------------------------------------------

const NETWORK_MESSAGE = "Không kết nối được máy chủ. Kiểm tra kết nối mạng rồi thử lại sau ít phút.";
const SERVER_MESSAGE = "Hệ thống đang gặp sự cố. Vui lòng thử lại sau ít phút.";

function errorRole(err: unknown): UserRole | null {
  if (!(err instanceof FetchError)) return null;
  const role = (err.data as { role?: unknown } | null)?.role;
  return role === "admin" || role === "operator" || role === "user" ? role : null;
}

export function loginErrorMessage(err: unknown, portalRole: UserRole): string {
  if (!(err instanceof FetchError)) return NETWORK_MESSAGE;
  const code = apiErrorCode(err);
  const isCustomerPortal = portalRole === "user";

  switch (code) {
    case "INVALID_CREDENTIALS":
      return isCustomerPortal
        ? "Sai email hoặc mật khẩu. Kiểm tra lại rồi thử lần nữa."
        : "Sai tên đăng nhập hoặc mật khẩu. Kiểm tra lại rồi thử lần nữa.";
    case "MISSING_FIELDS":
    case "INVALID_INPUT":
      return isCustomerPortal
        ? "Vui lòng nhập email và mật khẩu."
        : "Vui lòng nhập tên đăng nhập và mật khẩu.";
    case "USE_MOBILE_APP":
      return "Tài khoản khách hàng không dùng được cổng quản trị. Vui lòng đăng nhập trên ứng dụng di động Smart Home hoặc cổng web dành cho khách hàng.";
    case "WRONG_PORTAL":
    case "USE_DASHBOARD": {
      const role = errorRole(err);
      return role
        ? `Tài khoản này thuộc ${PORTAL_LABELS[role]}. Vui lòng đăng nhập tại đúng cổng dành cho vai trò của bạn.`
        : "Tài khoản không được phép đăng nhập vào cổng này. Vui lòng dùng đúng cổng dành cho vai trò của bạn.";
    }
    case "ACCOUNT_LOCKED":
      return isCustomerPortal
        ? "Tài khoản đã bị khoá. Vui lòng liên hệ bộ phận hỗ trợ khách hàng để được mở khoá."
        : "Tài khoản đã bị khoá. Vui lòng liên hệ quản trị viên để được mở khoá.";
    case "CSRF_CHECK_FAILED":
      return "Yêu cầu không hợp lệ. Vui lòng tải lại trang rồi đăng nhập lại.";
  }

  // Rate limiter backend: 10 lần thử đăng nhập mỗi 15 phút theo IP.
  if (err.status === 429) return "Bạn đã thử đăng nhập quá nhiều lần. Vui lòng đợi 15 phút rồi thử lại.";
  if (err.status === 0) return NETWORK_MESSAGE;
  if (err.status === 401) return loginErrorMessage(new FetchError(401, { error: "INVALID_CREDENTIALS" }), portalRole);
  if (err.status === 403) return "Tài khoản không được phép đăng nhập vào cổng này.";
  return SERVER_MESSAGE;
}

export function registerErrorMessage(err: unknown): string {
  if (!(err instanceof FetchError)) return NETWORK_MESSAGE;
  const code = apiErrorCode(err);
  switch (code) {
    case "EMAIL_TAKEN":
      return "Email này đã được đăng ký. Hãy đăng nhập, hoặc dùng một email khác.";
    case "INVALID_INPUT":
    case "MISSING_FIELDS":
      return "Thông tin chưa hợp lệ. Kiểm tra lại họ tên, email, số điện thoại và mật khẩu (8–128 ký tự).";
    case "USE_DASHBOARD":
    case "WRONG_PORTAL":
      return "Email này thuộc tài khoản nhân viên. Vui lòng dùng một email khác để đăng ký tài khoản khách hàng.";
    case "CSRF_CHECK_FAILED":
      return "Yêu cầu không hợp lệ. Vui lòng tải lại trang rồi thử lại.";
  }
  // Giới hạn đăng ký: 10 lần mỗi giờ theo IP.
  if (err.status === 429) return "Bạn đã đăng ký quá nhiều lần trong thời gian ngắn. Vui lòng thử lại sau 1 giờ.";
  if (err.status === 0) return NETWORK_MESSAGE;
  if (err.status === 409) return "Email này đã được đăng ký. Hãy đăng nhập, hoặc dùng một email khác.";
  if (err.status === 400) return "Thông tin chưa hợp lệ. Vui lòng kiểm tra lại các trường đã nhập.";
  return SERVER_MESSAGE;
}

// Kiểm tra phía client, trùng quy tắc backend (CONTRACT §2.3). Trả về thông điệp
// lỗi đầu tiên, hoặc null nếu hợp lệ.
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const PHONE_PATTERN = /^[0-9 +.-]{1,20}$/;

export function validateRegistration(input: {
  full_name: string;
  email: string;
  phone: string;
  password: string;
  confirm: string;
}): string | null {
  const fullName = input.full_name.trim();
  const email = input.email.trim();
  const phone = input.phone.trim();
  if (fullName.length < 2 || fullName.length > 128) return "Họ tên cần từ 2 đến 128 ký tự.";
  if (!email || email.length > 190 || !EMAIL_PATTERN.test(email)) return "Email chưa đúng định dạng (VD: ten@example.com).";
  if (phone && !PHONE_PATTERN.test(phone)) return "Số điện thoại chỉ gồm chữ số, dấu cách, + . - và tối đa 20 ký tự.";
  if (input.password.length < 8 || input.password.length > 128) return "Mật khẩu cần từ 8 đến 128 ký tự.";
  if (input.password !== input.confirm) return "Mật khẩu nhập lại chưa khớp.";
  return null;
}
