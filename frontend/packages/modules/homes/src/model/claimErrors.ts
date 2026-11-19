import { apiErrorCode } from "@shh/api-client";
import { portalErrorMessage, retryAfterSeconds } from "@shh/api-client/portal";

// FR-3.5 — thông điệp riêng cho luồng kích hoạt bằng Activation Code.
const CLAIM_MESSAGES: Record<string, string> = {
  NOT_FOUND: "Mã kích hoạt không đúng. Kiểm tra lại 12 ký tự trên tem dán ở hộp Gateway.",
  ALREADY_USED: "Mã này đã được dùng để kích hoạt một nhà. Nếu bạn vừa mua kit, hãy liên hệ nơi bán để được hỗ trợ.",
  EXPIRED: "Mã kích hoạt đã hết hạn hoặc đã bị thu hồi. Liên hệ bộ phận hỗ trợ để được cấp mã mới.",
  INVALID_INPUT: "Activation Code gồm 12 ký tự (dạng XXXX-XXXX-XXXX). Vui lòng kiểm tra lại.",
  TOO_MANY_REQUESTS: "Bạn đã thử kích hoạt quá nhiều lần trong giờ qua. Vui lòng đợi rồi thử lại.",
};

/** FR-3.5: NOT_FOUND / ALREADY_USED / EXPIRED / RATE_LIMITED kèm hướng xử lý. */
export function claimErrorMessage(err: unknown): string {
  if (apiErrorCode(err) === "RATE_LIMITED") {
    const seconds = retryAfterSeconds(err);
    const minutes = seconds ? Math.max(1, Math.ceil(seconds / 60)) : 15;
    return `Bạn đã nhập sai quá nhiều lần. Vui lòng đợi khoảng ${minutes} phút rồi thử lại.`;
  }
  return portalErrorMessage(err, CLAIM_MESSAGES);
}
