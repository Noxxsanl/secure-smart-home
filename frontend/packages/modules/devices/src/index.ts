// @shh/devices — thiết bị, gateway, bộ mô phỏng (console); danh sách/chi tiết/điều khiển thiết bị (cổng khách).
// Biểu đồ số đo (@shh/telemetry) và bảng log (@shh/audit) nhận qua slot `render*`.

// Console
export { DevicesPage } from "./features/device-list";
export { DeviceDetailPage, type DeviceTelemetrySlotProps } from "./features/device-detail";
export { GatewayListPage } from "./features/gateway-list";
export { GatewayDetailPage, type GatewayLogSlotProps } from "./features/gateway-detail";

// Cổng khách
export { HomeDeviceListPage } from "./features/home-device-list";
export { HomeDeviceDetailPage } from "./features/home-device-detail";
export { DeviceGrid, type DeviceGridProps } from "./features/device-grid";
