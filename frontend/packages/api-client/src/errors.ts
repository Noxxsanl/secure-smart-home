export class FetchError extends Error {
  status: number;
  data: unknown;

  constructor(status: number, data: unknown) {
    super(`HTTP ${status}`);
    this.name = "FetchError";
    this.status = status;
    this.data = data;
  }
}

/** Lỗi giả lập 404 cho đường dẫn có id không hợp lệ — trang hiển thị "không tìm thấy". */
export const INVALID_ROUTE_ID_ERROR = new FetchError(404, { error: "NOT_FOUND" });
