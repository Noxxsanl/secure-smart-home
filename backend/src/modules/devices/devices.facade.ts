// Facade của module devices: những hàm/kiểu mà module khác được gọi (qua index.ts). Chỉ re-export hoặc bọc mỏng.
//
// Bảng devices và secret_key chỉ module này được ghi/đọc (quy tắc T1, invariant 1) — telemetry và control không tự
// UPDATE devices mà gọi các hàm "ghi trạng thái" bên dưới, truyền `db` khi đang trong transaction của mình.
import type { Queryable } from "../../infrastructure/database/db";
import type { DeviceRow } from "./domain/device.types";
import { markProvisioned, updatePowerState } from "./infrastructure/device.repository";

// ── Đọc thiết bị (read model) ───────────────────────────────────────────────
export {
  buildReading,
  getDeviceRow,
  getGatewayCounts,
  latestReadings,
  listDeviceRowsByIds,
  listHomeDeviceRows,
  toConsoleDevice,
  toDeviceStateEvent,
  toDeviceStateSnapshot,
  toGateway,
} from "./infrastructure/device.read-model";
export { listGatewayAndSensorTypeStatus } from "./infrastructure/device.repository";
export type { DeviceTypeStatus } from "./infrastructure/device.repository";

// ── Quyền / tra cứu dùng chung giữa các module ──────────────────────────────
export { requireDeviceAccess } from "./domain/device-access";
export { ensureHomeAccess, requireDevice, requireGateway } from "./domain/console-access";
export { toCustomerDeviceOne, toCustomerDevices } from "./domain/device-view";

// ── Xác thực HMAC thiết bị (dùng chung HTTP + MQTT — invariant 4) ───────────
export { isSafeDeviceId, jsonHasNul, verifyDeviceHMAC, verifyGatewayHMAC } from "./domain/hmac.service";
export type { HMACVerifyResult, VerifiedDevice } from "./domain/hmac.service";
export { registerAuthFailure } from "./domain/auth-failure";
export type { AuthFailureResult } from "./domain/auth-failure";
/** Ký/kiểm HMAC bằng secret gateway (lệnh, OTA, ack) — secret không rời module devices (invariant 1, 2). */
export { getGatewaySigner } from "./domain/gateway-signer";
export type { GatewaySigner } from "./domain/gateway-signer";

// ── Ghi trạng thái thiết bị (chủ sở hữu bảng devices) ───────────────────────
export { insertDevice } from "./infrastructure/device-provisioning.repository";
/** Đã nhận số đo hợp lệ: last_seen = NOW(), fail_count = 0, (tuỳ chọn) last_ip. */
export { markDeviceSeen } from "./infrastructure/device.repository";

/** provision_status 'pending' → 'provisioned' cho những dòng đang pending (lần đầu được thấy). */
export async function markDevicesProvisioned(rows: readonly DeviceRow[], db?: Queryable): Promise<void> {
  await markProvisioned(
    rows.filter((row) => row.provision_status === "pending").map((row) => row.id),
    db
  );
}

/** Trạng thái relay sau khi thiết bị ack lệnh bật/tắt. */
export async function setDevicePowerState(deviceDbId: number, power: boolean, db?: Queryable): Promise<void> {
  await updatePowerState(deviceDbId, power, db);
}
