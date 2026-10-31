// Cửa ra DUY NHẤT của module devices: module khác chỉ được import từ đây (quy tắc phụ thuộc, modules/README.md).
// Danh sách tường minh từ devices.facade.ts — worker (presence monitor, track-device-ip) gắn qua devices.module.ts.
export { devicesModule } from "./devices.module";
export {
  buildReading,
  ensureHomeAccess,
  getDeviceRow,
  getGatewayCounts,
  insertDevice,
  isSafeDeviceId,
  jsonHasNul,
  latestReadings,
  listDeviceRowsByIds,
  listGatewayAndSensorTypeStatus,
  listHomeDeviceRows,
  getGatewaySigner,
  markDeviceSeen,
  markDevicesProvisioned,
  registerAuthFailure,
  requireDevice,
  requireDeviceAccess,
  requireGateway,
  setDevicePowerState,
  toConsoleDevice,
  toCustomerDeviceOne,
  toCustomerDevices,
  toDeviceStateEvent,
  toDeviceStateSnapshot,
  toGateway,
  verifyDeviceHMAC,
  verifyGatewayHMAC,
} from "./devices.facade";
export type {
  AuthFailureResult,
  DeviceTypeStatus,
  GatewaySigner,
  HMACVerifyResult,
  VerifiedDevice,
} from "./devices.facade";
export type {
  ConsoleDevice,
  CustomerDevice,
  DeviceAction,
  DeviceRow,
  Gateway,
  GatewayAction,
} from "./domain/device.types";
