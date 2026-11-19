"use client";

import { api } from "@shh/api-client";
import { POLL_DETAIL_MS, roomKey, useApi } from "@shh/api-client/portal";
import type { RoomDetail, RoomSummary } from "@shh/api-client/portal";

/** GET /rooms/:id — phòng + thiết bị + role của tôi trong nhà chứa phòng. */
export function useRoom(roomId: number | null) {
  return useApi<RoomDetail>(roomId === null ? null : roomKey(roomId), { refreshInterval: POLL_DETAIL_MS });
}

/** PATCH /rooms/:id — OWNER/CONTROLLER đổi tên phòng (FR-5.7). */
export function renameRoom(roomId: number, name: string) {
  return api<RoomSummary>(roomKey(roomId), { method: "PATCH", body: { name } });
}
