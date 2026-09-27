import { FetchError } from "@smarthome/shared/api/errors";

// NFR-U2 / bất biến #10: lỗi hiển thị hướng dẫn, không hiện mã thô.
const MESSAGES: Record<string, string> = {
  FORBIDDEN: "Vai trò của bạn trong nhà này không cho phép thao tác này. Hãy nhờ chủ nhà (Owner) cấp quyền.",
  NOT_FOUND: "Không tìm thấy dữ liệu, hoặc bạn không còn là thành viên của nhà này. Hãy tải lại trang.",
  DEVICE_OFFLINE: "Thiết bị đang offline nên không nhận lệnh. Kiểm tra nguồn điện và WiFi rồi thử lại.",
  NOT_CONTROLLABLE: "Thiết bị này chỉ đo đạc, không bật/tắt được.",
  TIMEOUT: "Thiết bị không phản hồi kịp. Trạng thái đã được khôi phục, vui lòng thử lại.",
  INVALID_INPUT: "Thông tin chưa hợp lệ. Vui lòng kiểm tra lại các trường đã nhập.",
  ALREADY_RESPONDED: "Gợi ý này đã được xử lý trước đó.",
};

// FR-3.5 — thông điệp riêng cho luồng claim.
const CLAIM_MESSAGES: Record<string, string> = {
  NOT_FOUND: "Mã kích hoạt không đúng. Kiểm tra lại 12 ký tự trên tem dán ở hộp Gateway.",
  ALREADY_USED: "Mã này đã được dùng để kích hoạt một nhà khác. Nếu bạn vừa mua kit, hãy liên hệ nơi bán để được hỗ trợ.",
  EXPIRED: "Mã kích hoạt đã hết hạn. Liên hệ bộ phận hỗ trợ để được cấp mã mới.",
  RATE_LIMITED: "Bạn đã nhập sai quá nhiều lần. Vui lòng đợi 15 phút rồi thử lại.",
};

function errorCode(err: unknown): string | null {
  if (err instanceof FetchError) return (err.data as { error?: string } | null)?.error ?? null;
  if (err instanceof Error && err.message === "TIMEOUT") return "TIMEOUT";
  return null;
}

export function portalErrorMessage(err: unknown): string {
  const code = errorCode(err);
  return (code && MESSAGES[code]) ?? "Không thể kết nối đến máy chủ. Vui lòng kiểm tra mạng và thử lại.";
}

export function claimErrorMessage(err: unknown): string {
  const code = errorCode(err);
  return (code && CLAIM_MESSAGES[code]) ?? portalErrorMessage(err);
}

export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("TIMEOUT")), ms);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (err) => { clearTimeout(timer); reject(err); },
    );
  });
}
