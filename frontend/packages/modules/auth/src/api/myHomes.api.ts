"use client";

import { homesKey, useApi } from "@shh/api-client/portal";
import type { MyHome } from "@shh/api-client/portal";

/** Cổng khách: GET /homes — mọi nhà mà tôi là thành viên hiệu lực (kèm role trong nhà). */
export function useMyHomes() {
  return useApi<MyHome[]>(homesKey, { revalidateOnFocus: true });
}
