import { api } from "@shh/api-client";
import { PORTAL_API } from "@shh/api-client/portal";
import type { ClaimResult } from "@shh/api-client/portal";

/**
 * POST /claim { code } — kích hoạt kit bằng Activation Code (FR-3.2 → 3.5).
 * Backend tự chuẩn hoá lại mã; lỗi: 404 NOT_FOUND · 409 ALREADY_USED ·
 * 410 EXPIRED · 429 RATE_LIMITED (kèm retry_after_seconds).
 */
export function claimHome(code: string) {
  return api<ClaimResult>(`${PORTAL_API}/claim`, { method: "POST", body: { code } });
}
