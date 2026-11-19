import { FetchError } from "./errors";

// ---------------------------------------------------------------------------
// HTTP client dùng chung cho 3 app. Trình duyệt luôn gọi cùng origin `/api/*`
// (next.config rewrites → backend; Docker thì nginx route thẳng), nên cookie
// HttpOnly của phiên được gửi kèm mà JS không bao giờ đọc được.
//
// Header `X-Portal` cho backend biết đọc cookie của cổng nào (sh_admin /
// sh_operator / sh_user) — 3 app dev chạy chung host `localhost` khác cổng nên
// cookie không tách theo cổng. Backend cũng dùng header này làm lớp chống CSRF
// cho request ghi (trang khác origin không tự gắn được custom header).
// ---------------------------------------------------------------------------

export type PortalRole = "admin" | "operator" | "user";

type QueryValue = string | number | boolean | null | undefined;

export type ApiOptions = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  /** Gửi dạng JSON. */
  body?: unknown;
  /** Gửi nguyên văn (VD file firmware .bin) — khi có thì bỏ qua `body`. */
  rawBody?: BodyInit;
  query?: Record<string, QueryValue>;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  /** Không gọi onUnauthorized khi 401 (dùng cho login / kiểm tra phiên). */
  skipAuthRedirect?: boolean;
};

let portalRole: PortalRole | null = null;
let unauthorizedHandler: (() => void) | null = null;

export function configureApi(options: { portal: PortalRole; onUnauthorized?: () => void }) {
  portalRole = options.portal;
  unauthorizedHandler = options.onUnauthorized ?? null;
}

function buildUrl(path: string, query?: Record<string, QueryValue>): string {
  if (!query) return path;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === "") continue;
    params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `${path}${path.includes("?") ? "&" : "?"}${qs}` : path;
}

export async function api<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json", ...options.headers };
  if (portalRole) headers["X-Portal"] = portalRole;

  let body: BodyInit | undefined;
  if (options.rawBody !== undefined) {
    body = options.rawBody;
  } else if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(options.body);
  }

  let res: Response;
  try {
    res = await fetch(buildUrl(path, options.query), {
      method: options.method ?? "GET",
      headers,
      body,
      credentials: "same-origin",
      cache: "no-store",
      signal: options.signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    // Mất mạng / backend không chạy — status 0 để UI hiện hướng dẫn kiểm tra kết nối.
    throw new FetchError(0, { error: "NETWORK_ERROR" });
  }

  if (res.status === 204) return undefined as T;

  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { error: "INVALID_RESPONSE" };
    }
  }

  if (!res.ok) {
    if (res.status === 401 && !options.skipAuthRedirect) unauthorizedHandler?.();
    throw new FetchError(res.status, data);
  }
  return data as T;
}

// Fetcher cho SWR khi key chính là path (VD useSWR("/api/dashboard/gateways", apiFetcher)).
export function apiFetcher<T>(path: string): Promise<T> {
  return api<T>(path);
}

// Lấy mã lỗi backend (`{ error: "CODE" }`) từ lỗi bất kỳ; null nếu không phải lỗi API.
export function apiErrorCode(err: unknown): string | null {
  if (!(err instanceof FetchError)) return null;
  const data = err.data as { error?: unknown } | null;
  return typeof data?.error === "string" ? data.error : null;
}
