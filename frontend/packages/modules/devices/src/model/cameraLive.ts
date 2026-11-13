// Xem trực tiếp camera (cổng khách): URL WebSocket, câu thông báo tiếng Việt theo mã đóng/trạng thái, vẽ khung hình.
// Hợp đồng: WS /api/portal/cameras/:deviceId/live — khung nhị phân = 1 JPEG, văn bản = {"type":"state","state":…}.

export type LiveState = "connecting" | "live" | "reconnecting" | "camera_unavailable";

/** Chờ trước mỗi lần nối lại khi rớt kết nối bất thường (ms); hết dãy thì dừng. */
export const LIVE_RETRY_DELAYS_MS = [1000, 2000, 4000] as const;

/** Mã đóng của backend (4xxx) — nối lại cũng vô ích, hiện hướng dẫn rồi dừng. */
const CLOSE_MESSAGES: Record<number, string> = {
  4401: "Phiên đăng nhập đã hết hạn, hãy đăng nhập lại",
  4403: "Bạn không có quyền xem trực tiếp camera này (khách được mời không xem được)",
  4404: "Không tìm thấy camera",
  4408: "Camera không phản hồi — kiểm tra nguồn camera và Gateway",
  4409: "Camera đang có quá nhiều người xem, hãy thử lại sau",
  4429: "Bạn đang mở quá nhiều luồng xem, hãy đóng bớt tab khác",
  4501: "Camera mô phỏng không hỗ trợ xem trực tiếp",
};

export const LIVE_STATE_MESSAGES: Record<Exclude<LiveState, "live">, string> = {
  connecting: "Đang kết nối camera…",
  reconnecting: "Mất tín hiệu, đang kết nối lại…",
  camera_unavailable: CLOSE_MESSAGES[4408],
};

// Lỗi 401/403/429 trước upgrade, trình duyệt chỉ thấy mã 1006 như mất mạng → câu gợi ý cả tải lại lẫn đăng nhập lại.
export const LIVE_UNREACHABLE_MESSAGE = "Không kết nối được máy chủ. Hãy tải lại trang hoặc đăng nhập lại.";
const ENDED_MESSAGE = "Phiên xem đã kết thúc";
const GENERIC_CLOSE_MESSAGE = "Không xem được camera lúc này, hãy thử lại sau";

export type CloseVerdict = { retry: false; message: string } | { retry: true };

/** Phân loại mã đóng WebSocket: lỗi có mã ứng dụng / kết thúc thường → dừng; còn lại (1006…) → thử nối lại. */
export function classifyClose(code: number): CloseVerdict {
  if (code === 1000) return { retry: false, message: ENDED_MESSAGE };
  if (code >= 4000 && code < 5000) return { retry: false, message: CLOSE_MESSAGES[code] ?? GENERIC_CLOSE_MESSAGE };
  return { retry: true };
}

/** Đọc tin văn bản của server; chỉ nhận trạng thái hợp lệ. */
export function parseLiveState(text: string): LiveState | null {
  try {
    const msg = JSON.parse(text) as { type?: unknown; state?: unknown };
    if (msg.type !== "state") return null;
    const s = msg.state;
    return s === "connecting" || s === "live" || s === "reconnecting" || s === "camera_unavailable" ? s : null;
  } catch {
    return null;
  }
}

/**
 * Cùng origin (qua Next rewrites / nginx). Dev: Next rewrites có thể không chuyển tiếp WebSocket →
 * đặt NEXT_PUBLIC_LIVE_WS_ORIGIN=ws://localhost:5000 (cookie không phân biệt cổng nên vẫn được gửi).
 */
export function cameraLiveUrl(deviceId: number): string {
  const override = process.env.NEXT_PUBLIC_LIVE_WS_ORIGIN?.trim().replace(/\/+$/, "");
  const origin = override || `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}`;
  return `${origin}/api/portal/cameras/${deviceId}/live`;
}

/** Vẽ bitmap lên canvas (đặt kích thước canvas theo khung); bitmap do bên gọi đóng. */
export function drawBitmap(canvas: HTMLCanvasElement, bitmap: ImageBitmap): void {
  if (canvas.width !== bitmap.width || canvas.height !== bitmap.height) {
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
  }
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0);
}
