import { dashApi, dashPath } from "@shh/api-client/dashboard";
import type { AccessRequestInput, ActivationCodeIssued, CreateSmartHomeInput, HomeStatus, OperatorAccessGrant, ProvisionResult, SmartHomeDetailHome, UpdateSmartHomeInput } from "@shh/api-client/dashboard";

// §5 Smart homes — `/api/dashboard/smart-homes/**`.

export function smartHomesKey(filters: { status?: HomeStatus | null; q?: string } = {}) {
  return dashPath("/smart-homes", { status: filters.status, q: filters.q?.trim() });
}

export function smartHomeKey(id: number) {
  return dashPath(`/smart-homes/${id}`);
}

/** FR-2.2: một request = một transaction (nhà + phòng + gateway + thiết bị + mã kích hoạt). */
export function createSmartHome(input: CreateSmartHomeInput) {
  return dashApi<ProvisionResult>("/smart-homes", { method: "POST", body: input });
}

/** name/address: Admin, hoặc Operator khi nhà chưa kích hoạt; status: chỉ Admin. */
export function updateSmartHome(id: number, patch: UpdateSmartHomeInput) {
  return dashApi<SmartHomeDetailHome>(`/smart-homes/${id}`, { method: "PATCH", body: patch });
}

export function assignOwner(id: number, userTag: string) {
  return dashApi<SmartHomeDetailHome>(`/smart-homes/${id}/assign-owner`, {
    method: "POST",
    body: { user_tag: userTag },
  });
}

/** Tạo mã mới (thu hồi mã cũ chưa dùng). Plaintext chỉ có trong response này. */
export function issueActivationCode(id: number) {
  return dashApi<ActivationCodeIssued>(`/smart-homes/${id}/activation-codes`, { method: "POST" });
}

/** FR-2.6: thu hồi mã chưa dùng. */
export function revokeActivationCode(id: number) {
  return dashApi<void>(`/smart-homes/${id}/activation-codes/revoke`, { method: "POST" });
}

/** FR-9.6: Operator tự xin quyền có thời hạn (hiệu lực ngay, Admin được báo, có audit). */
export function requestHomeAccess(id: number, input: AccessRequestInput) {
  return dashApi<OperatorAccessGrant>(`/smart-homes/${id}/access-requests`, {
    method: "POST",
    body: input,
  });
}

/** FR-9.6: Operator tự kết thúc sớm quyền truy cập của mình vào nhà này (Admin quản lý ở @shh/users). */
export function endOperatorAccess(grantId: number) {
  return dashApi<OperatorAccessGrant>(`/operator-access/${grantId}/revoke`, { method: "POST" });
}
