import { dashPath } from "@smarthome/console/api/client";

// §5 Customers — chỉ đọc. `q` khớp tên / user_tag / email / SĐT.

export function customersKey(q?: string) {
  return dashPath("/customers", { q: q?.trim() });
}

export function customerKey(id: number) {
  return dashPath(`/customers/${id}`);
}
