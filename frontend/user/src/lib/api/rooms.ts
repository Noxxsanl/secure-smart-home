"use client";

import { api } from "@smarthome/shared/api/http";
import { PORTAL_API, POLL_DETAIL_MS, useApi } from "@/lib/api/client";
import type { RoomDetail, RoomSummary } from "@/lib/api/types";

export const roomsPrefix = `${PORTAL_API}/rooms`;
export const roomKey = (roomId: number) => `${PORTAL_API}/rooms/${roomId}`;

/** GET /rooms/:id — phòng + thiết bị + role của tôi trong nhà chứa phòng. */
export function useRoom(roomId: number | null) {
  return useApi<RoomDetail>(roomId === null ? null : roomKey(roomId), { refreshInterval: POLL_DETAIL_MS });
}

/** PATCH /rooms/:id — OWNER/CONTROLLER đổi tên phòng (FR-5.7). */
export function renameRoom(roomId: number, name: string) {
  return api<RoomSummary>(roomKey(roomId), { method: "PATCH", body: { name } });
}
