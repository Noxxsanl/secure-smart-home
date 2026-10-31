import { portalErrorMessage } from "@shh/api-client/portal";

/** Lỗi khi bật/tắt relay — dùng cho toast hoàn tác (FR-5.3). */
export function commandErrorMessage(err: unknown): string {
  return portalErrorMessage(err);
}
