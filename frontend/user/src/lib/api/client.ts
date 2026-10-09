"use client";

import useSWR, { useSWRConfig, type SWRConfiguration } from "swr";
import { apiFetcher } from "@smarthome/shared/api/http";
import { FetchError } from "@smarthome/shared/api/errors";

// ---------------------------------------------------------------------------
// Nền chung cho lớp API của cổng khách hàng. Trình duyệt gọi cùng origin
// `/api/portal/**` (next.config rewrites → backend), cookie `sh_user` HttpOnly
// đi kèm tự động, header `X-Portal: user` do `api()` gắn.
//
// Quy ước SWR: key CHÍNH LÀ đường dẫn API (kể cả query) và fetcher là
// `apiFetcher` — sau thao tác ghi chỉ cần revalidate theo tiền tố đường dẫn.
// ---------------------------------------------------------------------------

export const PORTAL_API = "/api/portal";

// Web không có WebSocket (CONTRACT §10): polling theo loại trang.
export const POLL_OVERVIEW_MS = 5_000;
export const POLL_DETAIL_MS = 5_000;
export const POLL_NOTIFICATIONS_MS = 15_000;
export const POLL_TELEMETRY_MS = 60_000;

/** SWR với key = đường dẫn API; `null` để tạm không gọi. */
export function useApi<T>(key: string | null, options?: SWRConfiguration<T, unknown>) {
  return useSWR<T, unknown>(key, (path: string) => apiFetcher<T>(path), options);
}

type KeyMatcher = string | ((key: string) => boolean);

function matches(matcher: KeyMatcher, key: string): boolean {
  if (typeof matcher === "function") return matcher(key);
  return key === matcher || key.startsWith(`${matcher}/`) || key.startsWith(`${matcher}?`);
}

/**
 * Làm mới các truy vấn liên quan sau một thao tác ghi. Chuỗi = đường dẫn API,
 * khớp chính nó và mọi đường dẫn con / có query (VD `/api/portal/homes/3` khớp
 * `/api/portal/homes/3/overview`). Promise xong khi dữ liệu mới đã về.
 */
export function useRevalidate() {
  const { mutate } = useSWRConfig();
  return (...matchers: KeyMatcher[]) =>
    mutate((key) => typeof key === "string" && matchers.some((m) => matches(m, key)));
}

/** Khớp đúng một key (không lấy key con) — khi chỉ cần làm mới một truy vấn, VD danh sách nhà. */
export const exactly = (path: string) => (key: string) => key === path;

export function errorStatus(err: unknown): number | null {
  return err instanceof FetchError ? err.status : null;
}

// Cấu hình SWR của cổng: cache riêng cho mỗi lần vào khu vực đã đăng nhập (đăng
// xuất rồi đăng nhập tài khoản khác không thấy dữ liệu cũ), không thử lại lỗi
// 4xx (403/404/409 lặp lại vẫn vậy; 401 đã đưa về trang đăng nhập).
export const PORTAL_SWR_CONFIG: SWRConfiguration = {
  fetcher: (path: string) => apiFetcher(path),
  onErrorRetry(err, _key, _config, revalidate, { retryCount }) {
    if (err instanceof FetchError && err.status >= 400 && err.status < 500) return;
    if (retryCount >= 3) return;
    setTimeout(() => revalidate({ retryCount }), Math.min(2_000 * 2 ** retryCount, 15_000));
  },
};
