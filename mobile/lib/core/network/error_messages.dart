import 'dart:async';

import 'package:flutter_riverpod/misc.dart' show ProviderException;

import 'api_exception.dart';

/// Where an error happened — some codes need a more specific explanation
/// (e.g. `NOT_FOUND` on the claim screen means "unknown activation code").
enum ErrorContext {
  general,
  login,
  register,
  claim,
  changePassword,
  deviceCommand,
  members,
  invitation,
  automation,
  profile,
}

/// Shown for any transport failure (NFR-U2).
const networkErrorMessage =
    'Không kết nối được máy chủ. Kiểm tra mạng hoặc địa chỉ máy chủ.';

/// Exact wording requested for staff accounts on the mobile app (FR-1.4).
const useDashboardMessage =
    'Tài khoản quản trị/vận hành dùng Web Dashboard. '
    'Vui lòng đăng nhập trên trình duyệt máy tính.';

const _generalMessages = <String, String>{
  ApiErrorCode.missingFields:
      'Vui lòng điền đầy đủ các thông tin bắt buộc rồi thử lại.',
  ApiErrorCode.invalidInput:
      'Thông tin chưa hợp lệ. Kiểm tra lại các trường đã nhập rồi thử lại.',
  ApiErrorCode.noToken:
      'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.',
  ApiErrorCode.invalidToken:
      'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.',
  ApiErrorCode.tokenExpired:
      'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.',
  ApiErrorCode.invalidRefreshToken:
      'Phiên đăng nhập không còn hiệu lực. Vui lòng đăng nhập lại.',
  ApiErrorCode.refreshTokenExpired:
      'Phiên đăng nhập đã quá 30 ngày. Vui lòng đăng nhập lại.',
  ApiErrorCode.refreshTokenReused:
      'Phiên đăng nhập đã bị thu hồi để bảo vệ tài khoản. Vui lòng đăng nhập '
      'lại và đổi mật khẩu nếu bạn nghi ngờ có người khác dùng tài khoản.',
  ApiErrorCode.sessionExpired:
      'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.',
  ApiErrorCode.invalidCredentials:
      'Email hoặc mật khẩu không đúng. Kiểm tra lại rồi thử lại.',
  ApiErrorCode.accountLocked:
      'Tài khoản đã bị khoá. Vui lòng liên hệ bộ phận hỗ trợ để mở khoá.',
  ApiErrorCode.useDashboard: useDashboardMessage,
  ApiErrorCode.useMobileApp:
      'Tài khoản khách hàng chỉ dùng ứng dụng di động. Vui lòng đăng nhập lại '
      'trên ứng dụng này.',
  ApiErrorCode.wrongPortal:
      'Tài khoản này không dùng được trong ứng dụng khách hàng. Hãy đăng nhập '
      'bằng tài khoản khách hàng.',
  ApiErrorCode.csrfCheckFailed:
      'Yêu cầu không hợp lệ. Vui lòng tải lại màn hình rồi thử lại.',
  ApiErrorCode.emailTaken:
      'Email này đã được đăng ký. Hãy đăng nhập hoặc dùng email khác.',
  ApiErrorCode.forbidden:
      'Bạn không có quyền thực hiện thao tác này. Liên hệ chủ nhà nếu cần '
      'được cấp quyền.',
  ApiErrorCode.notFound:
      'Không tìm thấy dữ liệu hoặc bạn không còn quyền truy cập. Kéo xuống để '
      'tải lại.',
  ApiErrorCode.tooManyRequests:
      'Bạn thao tác quá nhanh. Vui lòng đợi một lát rồi thử lại.',
  ApiErrorCode.notControllable:
      'Thiết bị này không hỗ trợ bật/tắt từ xa.',
  ApiErrorCode.deviceOffline:
      'Thiết bị đang ngoại tuyến. Kiểm tra nguồn điện và kết nối của Gateway '
      'rồi thử lại.',
  ApiErrorCode.deviceBlocked:
      'Thiết bị đã bị khoá vì lý do bảo mật. Vui lòng liên hệ bộ phận hỗ trợ.',
  ApiErrorCode.homeSuspended:
      'Nhà đang bị tạm ngưng dịch vụ nên không thể điều khiển hoặc thay đổi. '
      'Vui lòng liên hệ bộ phận hỗ trợ.',
  ApiErrorCode.timeout:
      'Thiết bị không phản hồi kịp. Kiểm tra kết nối của thiết bị rồi thử lại.',
  ApiErrorCode.rateLimited:
      'Bạn đã thử quá nhiều lần. Vui lòng thử lại sau ít phút.',
  ApiErrorCode.alreadyUsed:
      'Mã này đã được sử dụng. Liên hệ chủ nhà hoặc bộ phận hỗ trợ.',
  ApiErrorCode.expired:
      'Mã đã hết hạn hoặc đã bị thu hồi. Liên hệ bộ phận hỗ trợ để được cấp '
      'mã mới.',
  ApiErrorCode.cannotInviteSelf:
      'Bạn không thể tự mời chính mình. Hãy nhập email của người cần mời.',
  ApiErrorCode.alreadyMember:
      'Người này đã là thành viên hoặc đang có lời mời chờ xác nhận.',
  ApiErrorCode.ownerCannotLeave:
      'Chủ nhà không thể rời nhà. Chuyển quyền sở hữu sẽ được hỗ trợ trong bản '
      'cập nhật sau.',
  ApiErrorCode.alreadyResponded:
      'Gợi ý này đã được xử lý trước đó. Kéo xuống để tải lại danh sách.',
  ApiErrorCode.accessGrantRequired:
      'Bạn cần được cấp quyền truy cập trước khi thực hiện thao tác này.',
  ApiErrorCode.alreadyClaimed:
      'Smart Home này đã có chủ. Liên hệ chủ nhà để được mời làm thành viên.',
  ApiErrorCode.customerNotFound:
      'Không tìm thấy khách hàng. Kiểm tra lại thông tin rồi thử lại.',
  ApiErrorCode.usernameTaken:
      'Tên đăng nhập đã tồn tại. Hãy chọn tên khác.',
  ApiErrorCode.versionExists:
      'Phiên bản này đã tồn tại. Hãy dùng số phiên bản khác.',
  ApiErrorCode.noTargets:
      'Không có thiết bị nào phù hợp để thực hiện thao tác này.',
  ApiErrorCode.notSimulated:
      'Thao tác này chỉ áp dụng cho thiết bị mô phỏng.',
  ApiErrorCode.conflict:
      'Dữ liệu vừa thay đổi. Kéo xuống để tải lại rồi thử lại.',
  ApiErrorCode.serverError:
      'Máy chủ đang gặp sự cố. Vui lòng thử lại sau ít phút.',
  ApiErrorCode.networkError: networkErrorMessage,
  ApiErrorCode.clientTimeout:
      'Máy chủ phản hồi quá lâu. Kiểm tra kết nối mạng rồi thử lại.',
  ApiErrorCode.invalidResponse:
      'Dữ liệu từ máy chủ không hợp lệ. Vui lòng thử lại sau hoặc cập nhật '
      'ứng dụng.',
  ApiErrorCode.invalidQr:
      'Mã QR không phải của Smart Home. Hãy quét mã QR in trên hộp sản phẩm '
      'hoặc nhập mã kích hoạt thủ công.',
  ApiErrorCode.unknown: 'Đã có lỗi xảy ra. Vui lòng thử lại.',
};

const _contextMessages = <ErrorContext, Map<String, String>>{
  ErrorContext.login: {
    ApiErrorCode.tooManyRequests:
        'Bạn đã đăng nhập sai quá nhiều lần. Vui lòng đợi 15 phút rồi thử lại.',
    ApiErrorCode.invalidInput:
        'Vui lòng nhập email và mật khẩu hợp lệ.',
    ApiErrorCode.missingFields: 'Vui lòng nhập email và mật khẩu.',
  },
  ErrorContext.register: {
    ApiErrorCode.invalidInput:
        'Thông tin đăng ký chưa hợp lệ: email đúng định dạng, mật khẩu 8–128 '
        'ký tự, họ tên 2–128 ký tự, số điện thoại tối đa 20 ký tự số.',
    ApiErrorCode.tooManyRequests:
        'Bạn đã đăng ký quá nhiều lần trong thời gian ngắn. Vui lòng thử lại '
        'sau 1 giờ.',
  },
  ErrorContext.claim: {
    ApiErrorCode.notFound:
        'Không tìm thấy mã kích hoạt. Kiểm tra lại 12 ký tự in trên hộp sản '
        'phẩm hoặc quét lại mã QR.',
    ApiErrorCode.alreadyUsed:
        'Mã kích hoạt này đã được sử dụng. Nếu nhà thuộc người thân, hãy nhờ '
        'chủ nhà mời bạn làm thành viên.',
    ApiErrorCode.expired:
        'Mã kích hoạt đã hết hạn hoặc đã bị thu hồi. Liên hệ đơn vị lắp đặt '
        'để được cấp mã mới.',
    ApiErrorCode.invalidInput:
        'Mã kích hoạt gồm 12 ký tự dạng XXXX-XXXX-XXXX. Kiểm tra lại rồi thử '
        'lại.',
    ApiErrorCode.missingFields:
        'Vui lòng quét mã QR hoặc nhập mã kích hoạt.',
  },
  ErrorContext.changePassword: {
    ApiErrorCode.invalidCredentials:
        'Mật khẩu hiện tại không đúng. Vui lòng nhập lại.',
    ApiErrorCode.invalidInput: 'Mật khẩu mới phải dài từ 8 đến 128 ký tự.',
  },
  ErrorContext.deviceCommand: {
    ApiErrorCode.timeout:
        'Thiết bị chưa xác nhận lệnh nên trạng thái đã được hoàn tác. Kiểm '
        'tra kết nối của thiết bị rồi thử lại.',
    ApiErrorCode.clientTimeout:
        'Thiết bị chưa xác nhận lệnh nên trạng thái đã được hoàn tác. Kiểm '
        'tra kết nối của thiết bị rồi thử lại.',
    ApiErrorCode.forbidden:
        'Bạn không có quyền điều khiển thiết bị này. Liên hệ chủ nhà để được '
        'cấp quyền.',
    ApiErrorCode.notFound:
        'Thiết bị không còn trong nhà hoặc bạn không còn quyền truy cập. Kéo '
        'xuống để tải lại.',
    ApiErrorCode.tooManyRequests:
        'Bạn bật/tắt quá nhanh. Vui lòng đợi một lát rồi thử lại.',
  },
  ErrorContext.members: {
    ApiErrorCode.forbidden: 'Chỉ chủ nhà mới quản lý được thành viên.',
    ApiErrorCode.invalidInput:
        'Thông tin mời chưa hợp lệ. Kiểm tra email; vai trò Khách cần thời '
        'hạn tối đa 30 ngày và ít nhất một thiết bị.',
    ApiErrorCode.notFound:
        'Thành viên không còn tồn tại hoặc bạn không còn quyền truy cập nhà '
        'này. Kéo xuống để tải lại.',
  },
  ErrorContext.invitation: {
    ApiErrorCode.notFound:
        'Lời mời đã hết hạn hoặc đã bị huỷ. Liên hệ chủ nhà để được mời lại.',
    ApiErrorCode.alreadyMember: 'Bạn đã là thành viên của nhà này.',
  },
  ErrorContext.automation: {
    ApiErrorCode.forbidden:
        'Bạn không có quyền thay đổi tự động hoá này. Chỉ chủ nhà hoặc người '
        'tạo quy tắc mới chỉnh sửa được.',
    ApiErrorCode.invalidInput:
        'Quy tắc chưa hợp lệ. Kiểm tra lại tên, điều kiện, thời gian và thiết '
        'bị thực hiện.',
    ApiErrorCode.notFound:
        'Quy tắc hoặc gợi ý không còn tồn tại. Kéo xuống để tải lại.',
  },
  ErrorContext.profile: {
    ApiErrorCode.invalidInput:
        'Thông tin chưa hợp lệ: họ tên 2–128 ký tự, số điện thoại tối đa 20 '
        'ký tự số.',
  },
};

/// Maps an error [code] to Vietnamese guidance (NFR-U2). Never returns the
/// raw code.
String messageForCode(
  String code, {
  ErrorContext context = ErrorContext.general,
  int? retryAfterSeconds,
}) {
  if (code == ApiErrorCode.rateLimited ||
      (code == ApiErrorCode.tooManyRequests && retryAfterSeconds != null)) {
    final waitText = _waitText(retryAfterSeconds);
    if (context == ErrorContext.claim || code == ApiErrorCode.rateLimited) {
      return 'Bạn đã nhập sai mã quá nhiều lần nên tạm thời bị khoá. '
          'Vui lòng thử lại $waitText.';
    }
    return 'Bạn thao tác quá nhanh. Vui lòng thử lại $waitText.';
  }
  final specific = _contextMessages[context]?[code];
  if (specific != null) return specific;
  return _generalMessages[code] ?? _generalMessages[ApiErrorCode.unknown]!;
}

String _waitText(int? seconds) {
  if (seconds == null || seconds <= 0) return 'sau ít phút';
  final minutes = (seconds / 60).ceil();
  return 'sau $minutes phút';
}

/// Removes framework wrappers (Riverpod's [ProviderException]).
Object unwrapError(Object error) {
  var current = error;
  while (current is ProviderException) {
    current = current.exception;
  }
  return current;
}

/// The error code carried by [error], or `null` for non-API errors.
String? errorCodeOf(Object error) {
  final unwrapped = unwrapError(error);
  return unwrapped is ApiException ? unwrapped.code : null;
}

/// User-facing Vietnamese message for any error thrown by repositories.
String userMessageFor(
  Object error, {
  ErrorContext context = ErrorContext.general,
}) {
  final unwrapped = unwrapError(error);
  if (unwrapped is ApiException) {
    return messageForCode(
      unwrapped.code,
      context: context,
      retryAfterSeconds: unwrapped.retryAfterSeconds,
    );
  }
  if (unwrapped is TimeoutException) {
    return messageForCode(ApiErrorCode.clientTimeout, context: context);
  }
  if (unwrapped is FormatException) {
    return messageForCode(ApiErrorCode.invalidResponse, context: context);
  }
  return messageForCode(ApiErrorCode.unknown, context: context);
}
