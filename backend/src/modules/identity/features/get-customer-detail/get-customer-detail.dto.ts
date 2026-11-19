import type { ActivationRecord, SmartHomeRow, Warranty } from "../../../homes";
import type { Customer } from "../../domain/console-identity.types";

/** Chi tiết khách trên console: hồ sơ + nhà + bảo hành + lịch sử kích hoạt. */
export interface CustomerDetail {
  customer: Customer;
  homes: SmartHomeRow[];
  warranties: Warranty[];
  activations: ActivationRecord[];
}
