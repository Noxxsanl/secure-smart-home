/// Codes this module explains itself (the shared table in
/// `core/network/error_messages.dart` does not know them).
abstract final class DeviceErrorCode {
  /// 502: the Node (or the device) did not carry the command out.
  static const commandFailed = 'COMMAND_FAILED';
}

/// Any relay command (on/off, curtain level).
const deviceCommandMessages = <String, String>{
  DeviceErrorCode.commandFailed:
      'Thiết bị chưa thực hiện được lệnh nên trạng thái đã được hoàn tác. '
      'Kiểm tra nguồn điện và kết nối của thiết bị rồi thử lại.',
};

/// `set_temp` of an air conditioner: a 502 usually means the Node has not
/// learned the IR code of that temperature (web `model/errors.ts`).
const acSetpointMessages = <String, String>{
  DeviceErrorCode.commandFailed:
      'Điều hòa chưa nhận lệnh. Có thể Node chưa học mã remote cho mức nhiệt '
      'này — vào trang chi tiết điều hòa, bấm Học mã (hoặc dùng màn hình Node) '
      'để học mã đó.',
  'NOT_CONTROLLABLE': 'Thiết bị này không hỗ trợ đặt nhiệt độ.',
};

/// `learn_code` (web `model/acCodes.ts` LEARN_OVERRIDES).
const acLearnMessages = <String, String>{
  DeviceErrorCode.commandFailed:
      'Node không thu được tín hiệu từ remote. Hãy chĩa remote gần mắt thu hơn '
      '(5–20 cm), kiểm tra mắt thu không bị che và pin remote còn tốt, bấm '
      'đúng 1 lần rồi thử lại. Nếu Node đang bận hoặc tín hiệu bị nhiễu, đợi '
      'vài giây rồi học lại.',
  'TIMEOUT':
      'Node không trả lời kịp. Kiểm tra Node còn online (nguồn điện, WiFi) rồi '
      'thử học lại.',
  'CLIENT_TIMEOUT':
      'Node không trả lời kịp. Kiểm tra Node còn online (nguồn điện, WiFi) rồi '
      'thử học lại.',
  'NOT_CONTROLLABLE': 'Thiết bị này không hỗ trợ học mã điều hòa.',
};
