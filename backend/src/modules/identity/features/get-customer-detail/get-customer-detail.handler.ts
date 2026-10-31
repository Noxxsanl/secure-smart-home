// Chi tiết khách trên console (FR-9.x): nhà, bảo hành, lịch sử kích hoạt.
import type { AuthContext } from "../../../../core/auth/auth-context";
import { notFound } from "../../../../shared/errors/http-error";
import { maskCustomerContact } from "../../../../shared/privacy";
import { listHomeRows } from "../../../homes";
import { unmaskedUserIds } from "../../domain/customer-visibility";
import { getCustomerById, listActivationsForUser, listWarranties } from "../../infrastructure/customers.read-model";
import type { CustomerDetail } from "./get-customer-detail.dto";

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
