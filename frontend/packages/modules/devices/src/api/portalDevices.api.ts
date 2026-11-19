"use client";

import { api } from "@shh/api-client";
import { POLL_DETAIL_MS, deviceKey, useApi } from "@shh/api-client/portal";
import type { CustomerDevice, DeviceAction, DeviceCommandBody, DeviceCommandResult, DeviceDetail } from "@shh/api-client/portal";

// Backend chờ ack tối đa 5 s rồi trả 504 TIMEOUT; client chờ dư 8 s để luôn
// nhận được câu trả lời của server nếu mạng bình thường.
export const COMMAND_TIMEOUT_MS = 8_000;

// Học mã IR: Node chờ người dùng bấm remote ≤ 10 s, server chờ ≤ 15 s → client chờ dư.
export const LEARN_TIMEOUT_MS = 20_000;

/** GET /devices/:id — thiết bị + phòng + nhà + role của tôi. */
export function useDevice(deviceId: number | null) {
  return useApi<DeviceDetail>(deviceId === null ? null : deviceKey(deviceId), { refreshInterval: POLL_DETAIL_MS });
}

/** PATCH /devices/:id — OWNER/CONTROLLER đổi tên thiết bị (FR-5.7). */
export function renameDevice(deviceId: number, deviceName: string) {
  return api<CustomerDevice>(deviceKey(deviceId), { method: "PATCH", body: { device_name: deviceName } });
}

/**
 * POST /devices/:id/commands — bật/tắt relay, trả về khi thiết bị đã xác nhận
 * (status "acked"). Huỷ bằng `signal` khi quá COMMAND_TIMEOUT_MS.
 */
export function sendDeviceCommand(deviceId: number, action: DeviceAction, signal?: AbortSignal) {
  return postCommand(deviceId, { action }, signal);
}

/**
 * POST /devices/:id/commands `{ action: "set_temp", temperature }` — chỉ điều hòa (appliance "ac"),
 * nhiệt độ nguyên 16..30. Điều hòa đang tắt sẽ được bật (mã IR mang cả trạng thái).
 */
export function sendSetTemperature(deviceId: number, temperature: number, signal?: AbortSignal) {
  return postCommand(deviceId, { action: "set_temp", temperature }, signal);
}

/**
 * POST /devices/:id/commands `{ action: "set_pos", position }` — chỉ rèm, vị trí nguyên 0..100 (0 = đóng hẳn).
 * Trả về khi thiết bị đã xác nhận, kèm thiết bị với `curtain_pos` mới.
 */
export function sendSetPosition(deviceId: number, position: number, signal?: AbortSignal) {
  return postCommand(deviceId, { action: "set_pos", position }, signal);
}

/**
 * POST /devices/:id/commands `{ action: "learn_code", slot }` — Node học 1 mã IR từ remote (slot "off" hoặc 16..30).
 * Trả về sau ~10–15 s (khi người dùng bấm remote hoặc hết giờ); huỷ bằng `signal` khi quá LEARN_TIMEOUT_MS.
 */
export function sendLearnCode(deviceId: number, slot: "off" | number, signal?: AbortSignal) {
  return postCommand(deviceId, { action: "learn_code", slot }, signal);
}

function postCommand(deviceId: number, body: DeviceCommandBody, signal?: AbortSignal) {
  return api<DeviceCommandResult>(`${deviceKey(deviceId)}/commands`, { method: "POST", body, signal });
}
