// Lỗi HTTP có mã cho module V2. Service/controller chỉ việc `throw new HttpError(...)`;
// error middleware trong app.ts chuyển thành `{ error, detail?, ...extra }` đúng quy ước
// skill backend §7 — không controller nào phải tự viết res.status().json() cho lỗi.

/** Trường phụ trả kèm lỗi, ví dụ `{ role: "user" }` cho USE_MOBILE_APP. */
export type ErrorExtraValue = string | number | boolean | null | { [key: string]: ErrorExtraValue } | ErrorExtraValue[];
export type ErrorExtra = Record<string, ErrorExtraValue>;

export interface ErrorBody {
  error: string;
  detail?: string;
  [key: string]: ErrorExtraValue | undefined;
}

export class HttpError extends Error {
  readonly status: number;
  readonly code: string;
  readonly detail?: string;
  readonly extra?: ErrorExtra;

  /**
   * @param status mã HTTP (400/401/403/404/409/410/429/504…)
   * @param code   mã lỗi UPPER_SNAKE mà client map sang hướng dẫn tiếng Việt
   * @param detail mô tả tiếng Anh cho dev — không chứa secret/token
   * @param extra  trường phụ, gộp thẳng vào body lỗi
   */
  constructor(status: number, code: string, detail?: string, extra?: ErrorExtra) {
    super(detail ? `${code}: ${detail}` : code);
    this.name = "HttpError";
    this.status = status;
    this.code = code;
    this.detail = detail;
    this.extra = extra;
  }

  toBody(): ErrorBody {
    // extra trước, error/detail sau để extra không ghi đè được mã lỗi
    const body: ErrorBody = { ...(this.extra ?? {}), error: this.code };
    if (this.detail) body.detail = this.detail;
    return body;
  }
}

/** Lỗi 404 chuẩn cho tài nguyên không tồn tại hoặc không thuộc quyền (invariant 6). */
export function notFound(detail?: string): HttpError {
  return new HttpError(404, "NOT_FOUND", detail);
}

/** Lỗi 403 chuẩn khi có quyền thấy tài nguyên nhưng role không đủ (invariant 6). */
export function forbidden(detail?: string): HttpError {
  return new HttpError(403, "FORBIDDEN", detail);
}

// Lỗi do body-parser/raw-body ném ra (JSON hỏng, body quá lớn…) có `type` + `status` 4xx.
interface BodyParserError {
  type: string;
  status: number;
}

export function isBodyParserError(err: unknown): err is BodyParserError {
  if (typeof err !== "object" || err === null) return false;
  const candidate = err as { type?: unknown; status?: unknown };
  return (
    typeof candidate.type === "string" &&
    typeof candidate.status === "number" &&
    candidate.status >= 400 &&
    candidate.status < 500
  );
}

/** Chuyển lỗi body-parser thành HttpError tương ứng (JSON hỏng → 400, quá lớn → 413). */
export function fromBodyParserError(err: BodyParserError): HttpError {
  if (err.type === "entity.too.large") {
    return new HttpError(413, "PAYLOAD_TOO_LARGE", "Request body is too large");
  }
  if (err.type === "entity.parse.failed") {
    return new HttpError(400, "INVALID_INPUT", "Malformed JSON body");
  }
  return new HttpError(err.status, "INVALID_INPUT", "Request body could not be read");
}
