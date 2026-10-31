import { dashApi, dashPath } from "@shh/api-client/dashboard";
import type { GrantAccessInput, OperatorAccessGrant } from "@shh/api-client/dashboard";

// §5 Operator access (FR-9.6). Admin thấy mọi quyền; Operator chỉ thấy của mình.

export function operatorAccessKey() {
  return dashPath("/operator-access");
}

/** Chỉ Admin; duration_hours 1–72. */
export function grantOperatorAccess(input: GrantAccessInput) {
  return dashApi<OperatorAccessGrant>("/operator-access", { method: "POST", body: input });
}

/** Admin, hoặc Operator tự kết thúc sớm quyền của mình. */
export function revokeOperatorAccess(id: number) {
  return dashApi<OperatorAccessGrant>(`/operator-access/${id}/revoke`, { method: "POST" });
}
