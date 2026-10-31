// Danh sách khách hàng trên console (FR-9.x), che liên hệ theo quyền của người xem.
import type { AuthContext } from "../../../../core/auth/auth-context";
import { maskCustomerContact } from "../../../../shared/privacy";
import type { Customer } from "../../domain/console-identity.types";
import { unmaskedUserIds } from "../../domain/customer-visibility";
import { listCustomers } from "../../infrastructure/customers.read-model";

export async function searchCustomers(auth: AuthContext, q: string | undefined): Promise<Customer[]> {
  const customers = await listCustomers(q, auth.role === "admin");
  const visible = await unmaskedUserIds(auth, customers.map((c) => c.user_id));
  // name + user_tag vẫn hiện: luồng gán chủ nhà (operator_assign) cần chúng
  return visible === null ? customers : customers.map((c) => (visible.has(c.user_id) ? c : maskCustomerContact(c)));
}
