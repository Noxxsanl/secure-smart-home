import { dashApi, dashPath, revalidateDashboard } from "@smarthome/console/api/client";
import type {
  ConsoleDevice, DeviceListFilters, DeviceStatus, TelemetryRange, UpdateDeviceInput,
} from "@smarthome/console/api/types";

// §5 Devices.

export function devicesKey(filters: DeviceListFilters = {}) {
  return dashPath("/devices", {
    home_id: filters.home_id,
    category: filters.category,
    status: filters.status,
    q: filters.q?.trim(),
    include_gateways: filters.include_gateways ? 1 : undefined,
  });
}

export function deviceKey(id: number) {
  return dashPath(`/devices/${id}`);
}

/**
 * Sau khi đổi thiết bị (trạng thái, gán nhà/phòng, xoá, mô phỏng): tải lại mọi
 * khoá có chứa dữ liệu thiết bị — danh sách/chi tiết thiết bị, gateway, nhà, thống kê.
 */
export function revalidateDeviceData() {
  return revalidateDashboard("/devices", "/gateways", "/smart-homes", "/stats");
}

/** Operator + nhà đã kích hoạt cần quyền truy cập (403 ACCESS_GRANT_REQUIRED). */
export function deviceTelemetryKey(id: number, range: TelemetryRange) {
  return dashPath(`/devices/${id}/telemetry`, { range });
}

/** active reset fail_count; Operator đổi trạng thái → Admin nhận thông báo. */
export function updateDeviceStatus(id: number, status: DeviceStatus) {
  return dashApi<ConsoleDevice>(`/devices/${id}/status`, { method: "PATCH", body: { status } });
}

/** Gán thiết bị vào nhà/phòng (phòng phải thuộc nhà) hoặc đổi tên. */
export function updateDevice(id: number, patch: UpdateDeviceInput) {
  return dashApi<ConsoleDevice>(`/devices/${id}`, { method: "PATCH", body: patch });
}

/** Chỉ Admin. */
export function deleteDevice(id: number) {
  return dashApi<void>(`/devices/${id}`, { method: "DELETE" });
}
