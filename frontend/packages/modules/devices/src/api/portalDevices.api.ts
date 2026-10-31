"use client";

import { api } from "@shh/api-client";
import { POLL_DETAIL_MS, deviceKey, useApi } from "@shh/api-client/portal";
import type { CustomerDevice, DeviceAction, DeviceCommandResult, DeviceDetail } from "@shh/api-client/portal";

// Backend chờ ack tối đa 5 s rồi trả 504 TIMEOUT; client chờ dư 8 s để luôn
// nhận được câu trả lời của server nếu mạng bình thường.
export const COMMAND_TIMEOUT_MS = 8_000;

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
  return api<DeviceCommandResult>(`${deviceKey(deviceId)}/commands`, {
    method: "POST",
    body: { action },
    signal,
  });
}
