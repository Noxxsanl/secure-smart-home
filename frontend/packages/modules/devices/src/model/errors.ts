import { portalErrorMessage } from "@shh/api-client/portal";

// 502 COMMAND_FAILED của điều hòa thường do Node chưa học mã IR của mức nhiệt đó.
const AC_OVERRIDES: Record<string, string> = {
  COMMAND_FAILED:
    "Điều hòa chưa nhận lệnh. Có thể Node chưa học mã remote cho mức nhiệt này — vào trang chi tiết điều hòa, bấm Học mã (hoặc dùng màn hình Node) để học mã đó.",
  NOT_CONTROLLABLE: "Thiết bị này không hỗ trợ đặt nhiệt độ.",
};

/** Lỗi khi gửi lệnh thiết bị — dùng cho toast hoàn tác (FR-5.3). `ac`: lệnh nhiệt độ của điều hòa. */
export function commandErrorMessage(err: unknown, options: { ac?: boolean } = {}): string {
  return portalErrorMessage(err, options.ac ? AC_OVERRIDES : undefined);
}
