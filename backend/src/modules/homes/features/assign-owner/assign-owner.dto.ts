// Input của POST /smart-homes/:id/assign-owner: gán theo customer_id hoặc user_tag (ít nhất một).
export interface AssignOwnerTarget {
  userTag?: string;
  customerId?: number;
}
