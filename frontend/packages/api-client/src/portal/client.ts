"use client";

import useSWR, { useSWRConfig, type SWRConfiguration } from "swr";
import { api, apiFetcher } from "../http";
import { FetchError } from "../errors";
import type { CameraSnapshotList } from "./types";

// ---------------------------------------------------------------------------
// Nền chung cho lớp API của cổng khách hàng. Trình duyệt gọi cùng origin
// `/api/portal/**` (next.config rewrites → backend), cookie `sh_user` HttpOnly
// đi kèm tự động, header `X-Portal: user` do `api()` gắn.
//
// Quy ước SWR: key CHÍNH LÀ đường dẫn API (kể cả query) và fetcher là
// `apiFetcher` — sau thao tác ghi chỉ cần revalidate theo tiền tố đường dẫn.
// ---------------------------------------------------------------------------

export const PORTAL_API = "/api/portal";

// Web không có WebSocket (CONTRACT §10): polling theo loại trang. Tổng quan/chi tiết thiết bị 2 s để thay đổi
// làm trên thiết bị / màn hình gateway hiện lên web trong ~2 s.
export const POLL_OVERVIEW_MS = 2_000;
export const POLL_DETAIL_MS = 2_000;
export const POLL_NOTIFICATIONS_MS = 15_000;
export const POLL_TELEMETRY_MS = 60_000;
export const POLL_SNAPSHOTS_MS = 15_000;

/** GET /devices/:id/snapshots?limit= — ảnh chụp của camera, mới nhất trước (limit 1..50). */
export function listDeviceSnapshots(deviceId: number, limit = 20) {
  return api<CameraSnapshotList>(`${PORTAL_API}/devices/${deviceId}/snapshots`, { query: { limit } });
}

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
