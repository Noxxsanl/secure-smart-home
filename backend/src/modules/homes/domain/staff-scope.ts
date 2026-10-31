// Phạm vi dữ liệu khách mà nhân viên được xem (FR-9.6): ADMIN không giới hạn, OPERATOR theo grant từng nhà.
// Module khác (devices, automation, identity) dùng qua index của homes. Chỉ 1 truy vấn grant.
import type { AuthContext } from "../../../core/auth/auth-context";
import { listActiveGrantHomeIds } from "../infrastructure/operator-access.repository";

/** Phạm vi xem dữ liệu khách của nhân viên: ADMIN không giới hạn; OPERATOR cần grant theo từng nhà. */
export interface StaffScope {
  unrestricted: boolean;
  grantedHomeIds: ReadonlySet<number>;
}

export async function loadStaffScope(auth: AuthContext): Promise<StaffScope> {
  if (auth.role === "admin") return { unrestricted: true, grantedHomeIds: new Set() };
  return { unrestricted: false, grantedHomeIds: new Set(await listActiveGrantHomeIds(auth.userId)) };
}

/**
 * Được xem dữ liệu khách của nhà không? Thiết bị chưa gán nhà (home null) và nhà chưa claim luôn được;
 * nhà đã claim cần grant (Operator).
 */
export function canSeeCustomerData(scope: StaffScope, home: { id: number | null; status: string | null }): boolean {
  if (scope.unrestricted || home.id === null || home.status === null || home.status === "unclaimed") return true;
  return scope.grantedHomeIds.has(home.id);
}

