import { FetchError } from "@smarthome/shared/api/errors";

/** Tham số route `[id]` → số nguyên dương, hoặc null nếu không hợp lệ. */
export function parseRouteId(raw: string | string[] | undefined): number | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value || !/^\d+$/.test(value)) return null;
  const id = Number(value);
  return id > 0 && Number.isSafeInteger(id) ? id : null;
}

/** Lỗi giả lập 404 cho đường dẫn có id không hợp lệ — trang hiển thị "không tìm thấy". */
export const INVALID_ROUTE_ID_ERROR = new FetchError(404, { error: "NOT_FOUND" });
