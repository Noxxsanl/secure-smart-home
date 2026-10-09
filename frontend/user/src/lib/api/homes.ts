"use client";

import { api } from "@smarthome/shared/api/http";
import { PORTAL_API, POLL_OVERVIEW_MS, useApi } from "@/lib/api/client";
import type { Home, HomeOverview, MyHome } from "@/lib/api/types";

// GET /homes — mọi nhà mà tôi là thành viên hiệu lực.
export const homesKey = `${PORTAL_API}/homes`;
// Tiền tố của mọi truy vấn theo nhà (overview, members, automations, suggestions).
export const homeScopeKey = (homeId: number) => `${PORTAL_API}/homes/${homeId}`;
export const overviewKey = (homeId: number) => `${PORTAL_API}/homes/${homeId}/overview`;

export function useMyHomes() {
  return useApi<MyHome[]>(homesKey, { revalidateOnFocus: true });
}

/** Tổng quan nhà — polling 5 s (mặc định) vì web không có WebSocket. */
export function useHomeOverview(homeId: number | null, refreshInterval = POLL_OVERVIEW_MS) {
  return useApi<HomeOverview>(homeId === null ? null : overviewKey(homeId), { refreshInterval });
}

/** PATCH /homes/:id — OWNER/CONTROLLER đổi tên / địa chỉ nhà (FR-5.7). */
export function updateHome(homeId: number, input: { name?: string; address?: string | null }) {
  return api<Home>(homeScopeKey(homeId), { method: "PATCH", body: input });
}
