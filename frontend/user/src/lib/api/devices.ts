"use client";

import { api } from "@smarthome/shared/api/http";
import { PORTAL_API, POLL_DETAIL_MS, POLL_TELEMETRY_MS, useApi } from "@/lib/api/client";
import type {
  CustomerDevice, DeviceAction, DeviceCommandResult, DeviceDetail, Telemetry, TelemetryRange,
} from "@/lib/api/types";

export const devicesPrefix = `${PORTAL_API}/devices`;
export const deviceKey = (deviceId: number) => `${PORTAL_API}/devices/${deviceId}`;
export const telemetryKey = (deviceId: number, range: TelemetryRange) =>
  `${PORTAL_API}/devices/${deviceId}/telemetry?range=${range}`;

// Backend chờ ack tối đa 5 s rồi trả 504 TIMEOUT; client chờ dư 8 s để luôn
// nhận được câu trả lời của server nếu mạng bình thường.
export const COMMAND_TIMEOUT_MS = 8_000;

/** GET /devices/:id — thiết bị + phòng + nhà + role của tôi. */
export function useDevice(deviceId: number | null) {
  return useApi<DeviceDetail>(deviceId === null ? null : deviceKey(deviceId), { refreshInterval: POLL_DETAIL_MS });
}

/** GET /devices/:id/telemetry?range=24h|7d — trung bình theo bucket, cũ → mới. */
export function useTelemetry(deviceId: number | null, range: TelemetryRange) {
  return useApi<Telemetry>(deviceId === null ? null : telemetryKey(deviceId, range), {
    refreshInterval: POLL_TELEMETRY_MS,
    keepPreviousData: true,
  });
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
