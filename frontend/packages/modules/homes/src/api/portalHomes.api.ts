"use client";

import { api } from "@shh/api-client";
import { homeScopeKey } from "@shh/api-client/portal";
import type { Home } from "@shh/api-client/portal";

/** PATCH /homes/:id — OWNER/CONTROLLER đổi tên / địa chỉ nhà (FR-5.7). */
export function updateHome(homeId: number, input: { name?: string; address?: string | null }) {
  return api<Home>(homeScopeKey(homeId), { method: "PATCH", body: input });
}
