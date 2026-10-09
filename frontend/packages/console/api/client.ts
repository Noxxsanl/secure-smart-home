import useSWR, { mutate as globalMutate, type SWRConfiguration } from "swr";
import { api, type ApiOptions } from "@smarthome/shared/api/http";
import { FetchError } from "@smarthome/shared/api/errors";

// ---------------------------------------------------------------------------
// Nền tảng gọi `/api/dashboard/**` cho console Admin/Operator: dựng URL (khoá
// SWR), gọi API qua http client dùng chung (cookie HttpOnly + X-Portal), và một
// wrapper useSWR không retry lỗi 4xx (403/404 có retry cũng không đổi kết quả).
// ---------------------------------------------------------------------------

export const DASHBOARD_API = "/api/dashboard";

export type QueryParams = Record<string, string | number | boolean | null | undefined>;

/** `/api/dashboard${path}?…` — bỏ tham số rỗng; boolean → "1"/"0" như hợp đồng. */
export function dashPath(path: string, query?: QueryParams): string {
  const base = `${DASHBOARD_API}${path}`;
  if (!query) return base;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === "") continue;
    params.set(key, typeof value === "boolean" ? (value ? "1" : "0") : String(value));
  }
  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}

/** Gọi `/api/dashboard${path}` — ném FetchError(status, { error }) khi lỗi. */
export function dashApi<T>(path: string, options?: ApiOptions): Promise<T> {
  return api<T>(`${DASHBOARD_API}${path}`, options);
}

function fetchKey<T>(key: string): Promise<T> {
  return api<T>(key);
}

const BASE_CONFIG: SWRConfiguration = {
  onErrorRetry(error, _key, _config, revalidate, { retryCount }) {
    // 4xx (hết phiên, không có quyền, không tồn tại, sai dữ liệu) — retry vô ích.
    if (error instanceof FetchError && error.status >= 400 && error.status < 500) return;
    if (retryCount >= 3) return;
    setTimeout(() => void revalidate({ retryCount }), 3000 * (retryCount + 1));
  },
};

/** useSWR với key là URL đầy đủ (dựng bằng `dashPath`); `null` = chưa gọi. */
export function useDashboardSWR<T>(key: string | null, config?: SWRConfiguration<T, unknown>) {
  return useSWR<T, unknown>(key, fetchKey<T>, { ...BASE_CONFIG, ...config });
}

/** Revalidate mọi khoá SWR bắt đầu bằng `/api/dashboard${prefix}` (VD "/smart-homes"). */
export function revalidateDashboard(...prefixes: string[]): Promise<unknown> {
  const full = prefixes.map((p) => `${DASHBOARD_API}${p}`);
  return globalMutate((key) => typeof key === "string" && full.some((p) => key.startsWith(p)));
}
