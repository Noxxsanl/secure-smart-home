"use client";

import { api } from "@smarthome/shared/api/http";
import { PORTAL_API, useApi } from "@/lib/api/client";
import type { CustomerProfile, UpdateProfileInput } from "@/lib/api/types";

export const profileKey = `${PORTAL_API}/me/profile`;

/** GET /me/profile */
export function useProfile() {
  return useApi<CustomerProfile>(profileKey);
}

/** PATCH /me/profile { full_name?, phone?, address? } */
export function updateProfile(input: UpdateProfileInput) {
  return api<CustomerProfile>(profileKey, { method: "PATCH", body: input });
}

/**
 * POST /me/password → 204. Sai mật khẩu hiện tại trả 401 INVALID_CREDENTIALS —
 * KHÔNG phải hết phiên, nên tắt chuyển hướng 401 mặc định; trang gọi tự phân biệt.
 * Thành công thì backend thu hồi mọi refresh token mobile của tài khoản.
 */
export function changePassword(currentPassword: string, newPassword: string) {
  return api<void>(`${PORTAL_API}/me/password`, {
    method: "POST",
    body: { current_password: currentPassword, new_password: newPassword },
    skipAuthRedirect: true,
  });
}
