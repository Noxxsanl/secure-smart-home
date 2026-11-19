// Che thông tin liên hệ khách trên console (FR-9.6): dùng chung cho search-customers và get-customer-detail.
import type { AuthContext } from "../../../core/auth/auth-context";
import { loadStaffScope } from "../../homes";
import { listUserIdsInHomes } from "../infrastructure/customers.read-model";

/**
 * Tập user_id được xem liên hệ đầy đủ. ADMIN: null (tất cả). OPERATOR: khách là thành viên của ít nhất
 * một nhà mà operator có grant còn hạn; còn lại bị che (FR-9.6).
 */
export async function unmaskedUserIds(auth: AuthContext, userIds: readonly number[]): Promise<Set<number> | null> {
  const scope = await loadStaffScope(auth);
  if (scope.unrestricted) return null;
  return listUserIdsInHomes([...scope.grantedHomeIds], userIds);
}
