"use client";

import { dashPath, useDashboardSWR } from "./client";
import type { Customer, SmartHomeDetail, SmartHomeRow } from "./types";

// ---------------------------------------------------------------------------
// Tra cứu dùng chung giữa nhiều module (ô chọn nhà, chọn phòng, tìm khách hàng).
// Khoá SWR trùng với danh sách/chi tiết của module sở hữu (@shh/homes, @shh/users)
// nên dùng chung cache: module khác không cần import module đó.
// ---------------------------------------------------------------------------

/** GET /smart-homes — danh sách nhà cho ô lọc/chọn, không poll. */
export function useHomeOptions() {
  const { data, isLoading } = useDashboardSWR<SmartHomeRow[]>(dashPath("/smart-homes"), { keepPreviousData: true });
  return { homes: data ?? [], isLoading };
}

/** GET /smart-homes/:id — phòng của nhà đã chọn; `homeId = null` thì chưa gọi. */
export function useHomeRooms(homeId: number | null) {
  const { data, error, isLoading } = useDashboardSWR<SmartHomeDetail>(
    homeId !== null ? dashPath(`/smart-homes/${homeId}`) : null,
  );
  return { rooms: data?.rooms ?? [], isLoading: homeId !== null && isLoading, error };
}

/** GET /customers?q= — tìm khách theo tên, user_tag, email, SĐT (từ 2 ký tự); `null` thì chưa gọi. */
export function useCustomerSearch(query: string | null) {
  const q = query?.trim() ?? "";
  return useDashboardSWR<Customer[]>(q.length >= 2 ? dashPath("/customers", { q }) : null, { keepPreviousData: true });
}
