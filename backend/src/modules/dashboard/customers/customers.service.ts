// Khách hàng trên console (FR-9.x): danh sách + chi tiết (nhà, bảo hành, lịch sử kích hoạt).
import { notFound } from "../../../lib/http";
import type { AuthContext } from "../../auth/auth.types";
import { loadStaffScope, maskCustomerContact } from "../common/staff";
import type { ActivationRecord, Customer, SmartHomeRow, Warranty } from "../dashboard.types";
import { listHomeRows } from "../smart-homes/smartHomes.repository";
import {
  getCustomerById,
  listActivationsForUser,
  listCustomers,
  listUserIdsInHomes,
  listWarranties,
} from "./customers.repository";

export interface CustomerDetail {
  customer: Customer;
  homes: SmartHomeRow[];
  warranties: Warranty[];
  activations: ActivationRecord[];
}

/**
 * Tập user_id được xem liên hệ đầy đủ. ADMIN: null (tất cả). OPERATOR: khách là thành viên của ít nhất
 * một nhà mà operator có grant còn hạn; còn lại bị che (FR-9.6).
 */
async function unmaskedUserIds(auth: AuthContext, userIds: readonly number[]): Promise<Set<number> | null> {
  const scope = await loadStaffScope(auth);
  if (scope.unrestricted) return null;
  return listUserIdsInHomes([...scope.grantedHomeIds], userIds);
}

export async function searchCustomers(auth: AuthContext, q: string | undefined): Promise<Customer[]> {
  const customers = await listCustomers(q, auth.role === "admin");
  const visible = await unmaskedUserIds(auth, customers.map((c) => c.user_id));
  // name + user_tag vẫn hiện: luồng gán chủ nhà (operator_assign) cần chúng
  return visible === null ? customers : customers.map((c) => (visible.has(c.user_id) ? c : maskCustomerContact(c)));
}

export async function getCustomerDetail(auth: AuthContext, id: number): Promise<CustomerDetail> {
  const found = await getCustomerById(id);
  if (!found) throw notFound("Customer not found");
  const visible = await unmaskedUserIds(auth, [found.user_id]);
  const customer = visible === null || visible.has(found.user_id) ? found : maskCustomerContact(found);
  const [homes, warranties, activations] = await Promise.all([
    listHomeRows({ memberUserId: customer.user_id }),
    listWarranties(customer.user_id),
    listActivationsForUser(customer.user_id, 50),
  ]);
  return { customer, homes, warranties, activations };
}
