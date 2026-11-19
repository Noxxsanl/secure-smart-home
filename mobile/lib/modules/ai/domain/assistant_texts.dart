/// Limits, fixed wording and error tables of the AI Assistant. Same limits and
/// wording as the web (`@shh/ai` model/assistant.ts) without the browser-only
/// parts. Mapping an exception to a sentence lives in
/// `application/assistant_errors.dart`.
library;

const textMaxLength = 500;
const maxRecordSeconds = 30;

/// The agent refuses audio above 1 MB (413).
const audioMaxBytes = 1048576;

/// Recordings shorter than this are taken as an accidental tap.
const minRecordMs = 600;

const openAiNotice =
    'Giọng nói, câu bạn gõ và tên phòng/thiết bị được gửi tới OpenAI để xử '
    'lý. Ứng dụng không lưu giọng nói hay câu nói của bạn.';

const assistantGreeting =
    'Chào bạn, mình là Trợ lý của ngôi nhà. Bạn có thể nói hoặc gõ, ví dụ:';

const assistantHint =
    'Lệnh nói/gõ rõ ràng (bật/tắt thiết bị nào, mấy giờ) mình làm luôn và báo '
    'lại; lệnh chưa rõ mình sẽ hỏi lại hoặc xin bạn xác nhận.';

/// Shown on an empty conversation; tapping one sends it as typed.
const examplePrompts = <String>[
  'Bật đèn',
  '8h tối bật đèn, tắt quạt sau 30 phút nữa',
  'Phòng khách bao nhiêu độ?',
];

/// Shown for a voice message while the transcript is not known.
const voiceMessageFallback = 'Tin nhắn giọng nói';

const _busy =
    'Trợ lý đang tạm bận. Bạn vẫn có thể bật/tắt hoặc hẹn giờ thủ công.';

/// The agent was not reached or does not run on this server.
const assistantUnavailable =
    'Trợ lý chưa sẵn sàng trên máy chủ này. Bạn vẫn có thể bật/tắt hoặc hẹn '
    'giờ thủ công.';

/// Errors of `/homes/:id/messages|voice` by `error` code.
const agentErrorMessages = <String, String>{
  'EMPTY_AUDIO': 'Mình chưa nghe thấy gì. Bạn giữ nút mic và nói lại nhé.',
  'AUDIO_TOO_LARGE':
      'Bản ghi âm quá dài. Bạn hãy nói ngắn hơn (tối đa $maxRecordSeconds '
      'giây).',
  'UNSUPPORTED_AUDIO':
      'Trợ lý chưa đọc được định dạng ghi âm này. Bạn hãy gõ chữ thay thế.',
  'RATE_LIMITED':
      'Bạn đã nhờ Trợ lý khá nhiều (hoặc nhà đã dùng hết lượt hôm nay). Đợi '
      'một lát rồi thử lại nhé.',
  'TOO_MANY_REQUESTS':
      'Bạn đã nhờ Trợ lý khá nhiều (hoặc nhà đã dùng hết lượt hôm nay). Đợi '
      'một lát rồi thử lại nhé.',
  'LLM_DISABLED':
      'Trợ lý chưa được bật trên hệ thống. Bạn vẫn có thể bật/tắt hoặc hẹn '
      'giờ thủ công.',
  'STT_DISABLED':
      'Nhận dạng giọng nói chưa được bật. Bạn hãy gõ chữ thay thế, hoặc '
      'bật/tắt và hẹn giờ thủ công.',
  'AGENT_UNAVAILABLE': _busy,
  'HOME_NOT_FOUND':
      'Không tìm thấy nhà này, hoặc bạn không còn là thành viên. Hãy kéo xuống '
      'để tải lại rồi chọn lại nhà.',
  // A 404 without an agent error code: nginx/backend has no `/api/agent` here.
  'NOT_FOUND': assistantUnavailable,
  'SESSION_EXPIRED': 'Phiên đăng nhập đã hết hạn, bạn đăng nhập lại nhé.',
  'NO_TOKEN': 'Phiên đăng nhập đã hết hạn, bạn đăng nhập lại nhé.',
  'ACCOUNT_LOCKED':
      'Tài khoản của bạn đang bị khoá. Hãy liên hệ bộ phận hỗ trợ.',
  'FORBIDDEN':
      'Bạn chưa có quyền thực hiện việc này trong nhà. Hãy nhờ chủ nhà cấp '
      'quyền.',
  'MESSAGE_TOO_LARGE': 'Tin nhắn quá dài, bạn rút gọn giúp mình nhé.',
  'INVALID_INPUT':
      'Mình chưa hiểu yêu cầu này. Bạn thử nói hoặc gõ lại ngắn gọn hơn nhé.',
  // Hết 60 s chờ: backend có thể đã chạy lệnh rõ — nhắc kiểm tra trước khi nói lại để khỏi chạy 2 lần.
  'CLIENT_TIMEOUT':
      'Trợ lý phản hồi quá lâu. Có thể yêu cầu đã được thực hiện — bạn xem lại '
      'thiết bị và mục Hẹn giờ trước khi nói lại nhé.',
};

/// Any other agent failure (5xx, unknown code) — never a raw code.
const assistantBusyMessage = _busy;

/// Errors of confirming/rejecting a pending request.
const confirmErrorMessages = <String, String>{
  'NOT_FOUND': 'Không tìm thấy yêu cầu này nữa. Bạn nói lại giúp mình nhé.',
  'REQUEST_NOT_PENDING':
      'Yêu cầu này đã được xử lý rồi nên không thực hiện lại.',
  'REQUEST_EXPIRED': 'Yêu cầu đã hết hạn, bạn nói lại giúp mình nhé.',
  'REQUEST_CHANGED':
      'Yêu cầu vừa thay đổi nên mình chưa thực hiện. Bạn nói lại giúp mình '
      'nhé.',
  'INVALID_INPUT':
      'Các bước đã chọn chưa hợp lệ. Hãy chọn ít nhất một bước rồi thử lại.',
};

/// Confirm errors after which the card can no longer be used.
const staleRequestCodes = <String>{
  'NOT_FOUND',
  'REQUEST_NOT_PENDING',
  'REQUEST_EXPIRED',
  'REQUEST_CHANGED',
};

/// Errors of cancelling a schedule the Assistant created.
const cancelErrorMessages = <String, String>{
  'NOT_FOUND': 'Không tìm thấy lịch này nữa. Danh sách sẽ được làm mới.',
  'SCHEDULE_NOT_CANCELLABLE':
      'Lịch này đã chạy hoặc đã bị huỷ nên không huỷ được nữa. Danh sách sẽ '
      'được làm mới.',
  'FORBIDDEN': 'Chỉ người tạo lịch hoặc chủ nhà mới huỷ được lịch này.',
};

/// Fallback sentence for a rejected step that has no `message`.
const rejectedFallbacks = <String, String>{
  'NOT_FOUND': 'Không tìm thấy thiết bị này.',
  'FORBIDDEN':
      'Bạn chưa có quyền điều khiển thiết bị này. Hãy nhờ chủ nhà cấp quyền.',
  'HOME_SUSPENDED': 'Dịch vụ của nhà đang tạm ngưng nên chưa điều khiển được.',
  'NOT_CONTROLLABLE': 'Thiết bị này không làm được thao tác đó.',
  'INVALID_WHEN':
      'Thời điểm hẹn không hợp lệ (cần từ 30 giây tới tối đa 7 ngày sau).',
  'SCHEDULE_LIMIT': 'Nhà đã có 50 hẹn giờ đang chờ. Hãy huỷ bớt rồi thử lại.',
};

const rejectedDefault = 'Mình chưa thực hiện được yêu cầu này.';

/// Why a finished schedule did not run as expected (`error_code`).
const scheduleReasons = <String, String>{
  'DEVICE_OFFLINE': 'thiết bị đang ngoại tuyến',
  'TIMEOUT': 'thiết bị không phản hồi',
  'COMMAND_FAILED': 'thiết bị báo lỗi',
  'DEVICE_BLOCKED': 'thiết bị đang bị chặn',
  'HOME_SUSPENDED': 'nhà đang tạm ngưng',
  'NOT_CONTROLLABLE': 'thiết bị không điều khiển được theo cách này',
  'NO_DEVICE': 'thiết bị đã bị xoá',
  'ACCESS_REVOKED': 'bạn không còn quyền điều khiển thiết bị này',
  'FORBIDDEN': 'vai trò của bạn không cho phép điều khiển thiết bị này',
  'NOT_FOUND': 'không tìm thấy thiết bị',
  'ALREADY_IN_STATE':
      'thiết bị đã ở trạng thái mong muốn nên không cần gửi lệnh',
  'INTERRUPTED': 'hệ thống bị gián đoạn lúc đang chạy',
  'UNKNOWN': 'lỗi không xác định',
};

/// Hold-to-talk guidance shown instead of recording.
abstract final class MicHints {
  /// A quick tap on the mic inside the Assistant.
  static const holdToTalk = 'Giữ nút mic để nói.';
  static const busy = 'Trợ lý đang xử lý câu trước…';

  /// The permission dialog took the finger away before recording began.
  static const granted = 'Đã cấp quyền micro — giữ nút mic để nói.';
}

/// Microphone problems, in Vietnamese with the way out (type instead).
abstract final class MicErrors {
  static const denied =
      'Ứng dụng chưa được dùng micro. Hãy mở Cài đặt → Ứng dụng → Smart Home '
      '→ Quyền → Micro, bật lên rồi thử lại — hoặc gõ chữ thay thế.';
  static const failed = 'Không ghi âm được. Bạn thử lại hoặc gõ chữ thay thế.';
  static const tooShort = 'Giữ lâu hơn một chút rồi nói nhé.';
  static const tooLarge =
      'Bản ghi âm quá dài. Bạn hãy nói ngắn hơn (tối đa $maxRecordSeconds '
      'giây).';
}

/// `m:ss` of a recording length in whole seconds.
String formatRecordClock(int seconds) =>
    '${seconds ~/ 60}:${(seconds % 60).toString().padLeft(2, '0')}';
