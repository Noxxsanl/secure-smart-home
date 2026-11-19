import { apiErrorCode } from "@shh/api-client";
import { errorStatus, portalErrorMessage } from "@shh/api-client/portal";
import type { AgentReply, AgentRejectedStep, Schedule } from "@shh/api-client/portal";

// Trợ lý AI: kiểu hội thoại, câu hướng dẫn tiếng Việt cho lỗi (agent, xác nhận, micro) — không bao giờ hiện mã thô.

export const TEXT_MAX_LENGTH = 500;
export const MAX_RECORD_SECONDS = 30;
/** Agent từ chối audio > 1 MB (413); chặn sớm ở trình duyệt. */
export const AUDIO_MAX_BYTES = 1_048_576;
/** Bản ghi ngắn hơn mức này coi như bấm nhầm. */
export const MIN_RECORD_MS = 600;

export const OPENAI_NOTICE =
  "Giọng nói, câu bạn gõ và tên phòng/thiết bị được gửi tới OpenAI để xử lý. Ứng dụng không lưu giọng nói hay câu nói của bạn.";

// Câu mẫu hiện ở hội thoại trống — bấm = gửi như người dùng gõ.
export const EXAMPLE_PROMPTS: readonly string[] = [
  "Bật đèn",
  "8h tối bật đèn, tắt quạt sau 30 phút nữa",
  "Phòng khách bao nhiêu độ?",
];

// ---- Hội thoại -----------------------------------------------------------

/** Trạng thái thẻ "Cần xác nhận". `error` = lỗi tạm (mất mạng…) — thẻ vẫn thao tác lại được. */
export type PendingOutcome =
  | { phase: "open"; error?: string }
  | { phase: "confirming" }
  | { phase: "rejecting" }
  | { phase: "done"; results: Schedule[] }
  | { phase: "rejected" }
  /** Đã xử lý ở nơi khác / hết hạn / bước bị đổi — khoá thẻ, `message` giải thích. */
  | { phase: "stale"; message: string };

export type ChatEntry =
  | { id: number; role: "user"; text: string | null; voice: boolean }
  | { id: number; role: "assistant"; reply: AgentReply; scheduled: Schedule[]; outcome: PendingOutcome | null }
  | { id: number; role: "error"; text: string };

// ---- Lỗi -----------------------------------------------------------------

const BUSY = "Trợ lý đang tạm bận. Bạn vẫn có thể bật/tắt hoặc hẹn giờ thủ công.";

const AGENT_ERRORS: Record<string, string> = {
  EMPTY_AUDIO: "Mình chưa nghe thấy gì. Bạn bấm micro và nói lại nhé.",
  AUDIO_TOO_LARGE: `Bản ghi âm quá dài. Bạn hãy nói ngắn hơn (tối đa ${MAX_RECORD_SECONDS} giây).`,
  UNSUPPORTED_AUDIO: "Trợ lý chưa đọc được định dạng ghi âm của trình duyệt này. Bạn hãy gõ chữ thay thế.",
  RATE_LIMITED: "Bạn đã nhờ Trợ lý khá nhiều (hoặc nhà đã dùng hết lượt hôm nay). Đợi một lát rồi thử lại nhé.",
  LLM_DISABLED: "Trợ lý chưa được bật trên hệ thống. Bạn vẫn có thể bật/tắt hoặc hẹn giờ thủ công.",
  STT_DISABLED: "Nhận dạng giọng nói chưa được bật. Bạn hãy gõ chữ thay thế, hoặc bật/tắt và hẹn giờ thủ công.",
  AGENT_UNAVAILABLE: BUSY,
  HOME_NOT_FOUND: "Không tìm thấy nhà này, hoặc bạn không còn là thành viên. Hãy tải lại trang rồi chọn lại nhà.",
  SESSION_EXPIRED: "Phiên đăng nhập đã hết hạn, bạn đăng nhập lại nhé.",
  ACCOUNT_LOCKED: "Tài khoản của bạn đang bị khoá. Hãy liên hệ bộ phận hỗ trợ.",
  FORBIDDEN: "Bạn chưa có quyền thực hiện việc này trong nhà. Hãy nhờ chủ nhà cấp quyền.",
  MESSAGE_TOO_LARGE: "Tin nhắn quá dài, bạn rút gọn giúp mình nhé.",
};

const CONFIRM_ERRORS: Record<string, string> = {
  NOT_FOUND: "Không tìm thấy yêu cầu này nữa. Bạn nói lại giúp mình nhé.",
  REQUEST_NOT_PENDING: "Yêu cầu này đã được xử lý rồi nên không thực hiện lại.",
  REQUEST_EXPIRED: "Yêu cầu đã hết hạn, bạn nói lại giúp mình nhé.",
  REQUEST_CHANGED: "Yêu cầu vừa thay đổi nên mình chưa thực hiện. Bạn nói lại giúp mình nhé.",
  INVALID_INPUT: "Các bước đã chọn chưa hợp lệ. Hãy chọn ít nhất một bước rồi thử lại.",
};

// Lỗi mà thẻ xác nhận không thể thử lại — khoá thẻ.
const STALE_CODES = new Set(["NOT_FOUND", "REQUEST_NOT_PENDING", "REQUEST_EXPIRED", "REQUEST_CHANGED"]);

/**
 * Câu lỗi khi gọi agent (voice/messages). Mã agent → câu riêng; 413 theo kênh (`voice`);
 * mã lạ / 5xx (agent tắt, proxy lỗi) → "tạm bận", không hiện mã thô. Chỉ lỗi không phải HTTP
 * (mất mạng, quá thời gian chờ) và 401 đi tiếp `portalErrorMessage`.
 */
export function assistantErrorMessage(err: unknown, voice = false): string {
  const code = apiErrorCode(err);
  if (code && AGENT_ERRORS[code]) return AGENT_ERRORS[code];
  const status = errorStatus(err);
  if (status === 413) return voice ? AGENT_ERRORS.AUDIO_TOO_LARGE : AGENT_ERRORS.MESSAGE_TOO_LARGE;
  // 429 từ nginx (limit_req) trả thân HTML, không có mã của agent
  if (status === 429) return AGENT_ERRORS.RATE_LIMITED;
  if (status === null || status === 401) return portalErrorMessage(err);
  return BUSY;
}

/** Câu lỗi khi xác nhận/từ chối yêu cầu hoặc huỷ lịch (backend, kênh khách). */
export function confirmErrorMessage(err: unknown): string {
  return portalErrorMessage(err, CONFIRM_ERRORS);
}

/** Câu lỗi khi huỷ một lịch Trợ lý đã hẹn. */
export function cancelErrorMessage(err: unknown): string {
  return portalErrorMessage(err, {
    NOT_FOUND: "Không tìm thấy lịch này nữa. Danh sách sẽ được làm mới.",
    SCHEDULE_NOT_CANCELLABLE: "Lịch này đã chạy hoặc đã bị huỷ nên không huỷ được nữa. Danh sách sẽ được làm mới.",
    FORBIDDEN: "Chỉ người tạo lịch hoặc chủ nhà mới huỷ được lịch này.",
  });
}

/** true nếu lỗi nghĩa là yêu cầu không còn xác nhận được nữa (đã xử lý / hết hạn / bị đổi / không còn). */
export function isStaleRequestError(err: unknown): boolean {
  const code = apiErrorCode(err);
  return code !== null && STALE_CODES.has(code);
}

const REJECTED_FALLBACK: Record<string, string> = {
  NOT_FOUND: "Không tìm thấy thiết bị này.",
  FORBIDDEN: "Bạn chưa có quyền điều khiển thiết bị này. Hãy nhờ chủ nhà cấp quyền.",
  HOME_SUSPENDED: "Dịch vụ của nhà đang tạm ngưng nên chưa điều khiển được.",
  NOT_CONTROLLABLE: "Thiết bị này không làm được thao tác đó.",
  INVALID_WHEN: "Thời điểm hẹn không hợp lệ (cần từ 30 giây tới tối đa 7 ngày sau).",
  SCHEDULE_LIMIT: "Nhà đã có 50 hẹn giờ đang chờ. Hãy huỷ bớt rồi thử lại.",
};

/** Câu cho một bước bị từ chối: ưu tiên chữ của agent, thiếu thì theo mã. */
export function rejectedMessage(step: AgentRejectedStep): string {
  if (step.message?.trim()) return step.message;
  return REJECTED_FALLBACK[step.code] ?? "Mình chưa thực hiện được yêu cầu này.";
}

// ---- Micro ----------------------------------------------------------------

export type RecordedAudio = {
  blob: Blob;
  /** MIME thật của bản ghi (có thể kèm `;codecs=`). */
  mimeType: string;
  durationMs: number;
};

export type RecorderPhase = "idle" | "starting" | "recording";

export const MIC_ERRORS = {
  insecure:
    "Trình duyệt chỉ cho dùng micro khi trang chạy trên HTTPS hoặc localhost. Bạn hãy mở trang bằng địa chỉ HTTPS, hoặc gõ chữ thay thế.",
  denied:
    "Bạn đang chặn quyền dùng micro. Hãy bấm biểu tượng ổ khoá cạnh thanh địa chỉ, cho phép micro rồi thử lại — hoặc gõ chữ thay thế.",
  notFound: "Không tìm thấy micro. Hãy cắm micro hoặc kiểm tra thiết bị âm thanh rồi thử lại — hoặc gõ chữ thay thế.",
  busy: "Micro đang được ứng dụng khác sử dụng. Hãy đóng ứng dụng đó rồi thử lại — hoặc gõ chữ thay thế.",
  unsupported:
    "Trình duyệt này chưa hỗ trợ ghi âm. Hãy dùng Chrome, Edge, Firefox hoặc Safari bản mới, hoặc gõ chữ thay thế.",
  tooShort: "Bản ghi quá ngắn. Bạn bấm micro, nói rõ yêu cầu rồi bấm lần nữa để gửi nhé.",
  tooLarge: `Bản ghi âm quá dài. Bạn hãy nói ngắn hơn (tối đa ${MAX_RECORD_SECONDS} giây).`,
  failed: "Không ghi âm được. Bạn thử lại hoặc gõ chữ thay thế.",
} as const;

/** Lỗi `getUserMedia` → câu hướng dẫn. */
export function micErrorMessage(err: unknown): string {
  const name = (err as { name?: unknown } | null)?.name;
  if (name === "NotAllowedError" || name === "SecurityError" || name === "PermissionDeniedError") return MIC_ERRORS.denied;
  if (name === "NotFoundError" || name === "OverconstrainedError" || name === "DevicesNotFoundError") return MIC_ERRORS.notFound;
  if (name === "NotReadableError" || name === "AbortError") return MIC_ERRORS.busy;
  return MIC_ERRORS.failed;
}

// Định dạng ưu tiên, theo thứ tự; trình duyệt hỗ trợ cái đầu tiên thì dùng (agent nhận webm/ogg/mp4/mpeg/wav).
export const RECORDER_MIME_CANDIDATES: readonly string[] = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/ogg;codecs=opus",
];

/** Định dạng ghi âm đầu tiên trình duyệt hỗ trợ; null nếu không có cái nào. */
export function pickRecorderMime(): string | null {
  if (typeof MediaRecorder === "undefined" || typeof MediaRecorder.isTypeSupported !== "function") return null;
  return RECORDER_MIME_CANDIDATES.find((m) => MediaRecorder.isTypeSupported(m)) ?? null;
}

/** Lý do không ghi âm được ở môi trường này (null = dùng được). Không xin quyền micro. */
export function recorderUnsupportedReason(): string | null {
  if (typeof window === "undefined") return null;
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) return MIC_ERRORS.insecure;
  if (typeof MediaRecorder === "undefined") return MIC_ERRORS.unsupported;
  return null;
}

// ---- Cờ "đã xem thông báo OpenAI" (localStorage, có thể bị chặn) -------------

// _v2: nội dung thông báo đã đổi (nêu cả câu gõ + tên phòng/thiết bị) — người đã xem bản cũ thấy lại.
const NOTICE_KEY = "assistant:openai_notice_seen_v2";

export function readNoticeSeen(): boolean {
  try {
    return window.localStorage.getItem(NOTICE_KEY) === "1";
  } catch {
    return false;
  }
}

export function markNoticeSeen() {
  try {
    window.localStorage.setItem(NOTICE_KEY, "1");
  } catch {
    // Storage bị chặn (private mode) — thông báo sẽ hiện lại lần sau.
  }
}
