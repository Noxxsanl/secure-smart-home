import { dashApi, dashPath } from "@smarthome/console/api/client";
import type { StaffAccount } from "@smarthome/console/api/types";

// §5 Team (ADMIN, FR-11.4). Không sửa/khoá được chính mình hay Admin khác (403).

export const STAFF_USERNAME_PATTERN = /^[a-z0-9._-]{3,32}$/;
export const STAFF_PASSWORD_MIN = 8;

export function teamKey() {
  return dashPath("/team");
}

export function createOperatorAccount(input: { username: string; password: string }) {
  return dashApi<StaffAccount>("/team", {
    method: "POST",
    body: { username: input.username, password: input.password, role: "operator" },
  });
}

export function updateStaffAccount(id: number, patch: { status?: "active" | "locked"; password?: string }) {
  return dashApi<StaffAccount>(`/team/${id}`, { method: "PATCH", body: patch });
}

export function deleteStaffAccount(id: number) {
  return dashApi<void>(`/team/${id}`, { method: "DELETE" });
}
