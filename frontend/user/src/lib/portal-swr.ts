"use client";

import useSWR, { useSWRConfig, type SWRConfiguration } from "swr";
import { useCurrentHome } from "@/features/home/providers/CurrentHomeProvider";

// Truy vấn dữ liệu của nhà đang chọn. Key có customerId + homeId nên đổi nhà
// là SWR tự tải lại, không lẫn cache giữa các nhà.
export function useHomeQuery<T>(
  name: string,
  fetcher: (customerId: number, homeId: number) => Promise<T>,
  options?: SWRConfiguration<T>,
) {
  const { customerId, current } = useCurrentHome();
  const homeId = current?.home.id ?? null;
  return useSWR<T>(
    homeId === null ? null : [`/portal/${name}`, customerId, homeId],
    () => fetcher(customerId, homeId as number),
    options,
  );
}

// Sau một thao tác ghi (bật đèn, đổi role, ...) làm mới mọi truy vấn của cổng.
export function useRevalidatePortal() {
  const { mutate } = useSWRConfig();
  return () => mutate((key) => Array.isArray(key) && String(key[0]).startsWith("/portal/"));
}
