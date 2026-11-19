// Khoá + tiêu chí đếm cho các bộ giới hạn LỖI XÁC THỰC của đường thiết bị (snapshot camera, telemetry HTTP, uplink WS).
// Hàm thuần để test không cần Express thật.
//
// Vì sao khoá `<ip>|<gateway_id>` mà không chỉ ip: khi backend đứng sau nginx mà TRUST_PROXY không bật (dev: compose.yaml
// publish :5000 nên KHÔNG được bật — gọi thẳng :5000 giả được X-Forwarded-For), mọi gateway cùng IP nginx. Khoá chỉ theo
// IP thì kẻ ngoài gửi 20 request rác là mọi gateway bị 429 suốt 15 phút. Tách theo gateway_id thì rác chỉ làm cạn xô của
// chính id đó (và id sai/thiếu dồn vào xô `<ip>|-`), gateway khác không bị ảnh hưởng.
// Đánh đổi: kẻ ngoài đổi gateway_id liên tục để né hạn mức mỗi xô — chấp nhận, vì mỗi request rác vẫn bị từ chối ở bước
// xác thực (không khoá thiết bị) và hạn mức tổng theo IP của cameraSnapshotLimiter/deviceDataLimiter vẫn áp dụng.
// express-rate-limit 7.5.x chưa có ipKeyGenerator/kiểm IPv6 trong keyGenerator (có từ v8) — khi nâng cấp, bọc phần `ip`
// bằng helper đó để IPv6 gộp theo /64.
import { isWellFormedUid } from "../../shared/validation/device-input";

/** Mã trạng thái tính là "lỗi xác thực" (400 thiếu/sai trường, 401 chữ ký/ts, 403 sai loại thiết bị, 404 không có). */
const COUNTED_REJECT_STATUSES = new Set([400, 401, 403, 404]);
/** Chỉ 409/413/415/5xx… KHÔNG đếm: không phải lỗi xác thực (xung đột trạng thái, ảnh quá cỡ, lỗi server). */
export function isAuthRejectionStatus(status: number): boolean {
  return COUNTED_REJECT_STATUSES.has(status);
}

/**
 * `requestWasSuccessful` cho express-rate-limit + skipSuccessfulRequests: lượt "thành công" được trả lại (decrement).
 * Lượt chỉ giữ lại khi là lỗi xác thực; thêm 429 để lượt bị chính bộ giới hạn này chặn không bị trả lại (nếu không số
 * đếm tụt về đúng ngưỡng và request kế tiếp lại lọt qua).
 */
export function requestWasNotCountedFailure(status: number): boolean {
  return !(isAuthRejectionStatus(status) || status === 429);
}

/** `<ip>|<gateway_id>`; gateway_id thiếu/không hợp lệ (isWellFormedUid) → `<ip>|-`. */
export function gatewayScopedKey(ip: string | undefined, gatewayId: unknown): string {
  return `${ip ?? "unknown"}|${isWellFormedUid(gatewayId) ? gatewayId : "-"}`;
}

/** Snapshot camera: gateway id nằm ở header `X-Gateway-Id`. */
export function snapshotFailKey(req: { ip?: string; headers: Record<string, string | string[] | undefined> }): string {
  return gatewayScopedKey(req.ip, req.headers["x-gateway-id"]);
}

/**
 * Telemetry HTTP `/api/device/data`: express.json chạy TRƯỚC limiter (app.ts) nên `gateway_id` trong body đã có; nó chỉ
 * là khoá chia xô (chưa xác thực) — gateway_id giả chỉ đẩy request vào xô của id đó, không khoá thiết bị thật.
 */
export function deviceDataFailKey(req: { ip?: string; body?: unknown }): string {
  const body = req.body;
  const gatewayId = typeof body === "object" && body !== null ? (body as Record<string, unknown>).gateway_id : undefined;
  return gatewayScopedKey(req.ip, gatewayId);
}
