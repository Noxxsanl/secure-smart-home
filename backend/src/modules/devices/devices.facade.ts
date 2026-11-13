// Facade của module devices: những hàm/kiểu mà module khác được gọi (qua index.ts). Chỉ re-export hoặc bọc mỏng.
//
// Bảng devices và secret_key chỉ module này được ghi/đọc (quy tắc T1, invariant 1) — telemetry và control không tự
// UPDATE devices mà gọi các hàm "ghi trạng thái" bên dưới, truyền `db` khi đang trong transaction của mình.
import type { Queryable } from "../../infrastructure/database/db";
import type { DeviceRow } from "./domain/device.types";
import { markProvisioned, orAcCodes, updateAcSetpoint, updateCurtainPos, updatePowerState } from "./infrastructure/device.repository";

// ── Đọc thiết bị (read model) ───────────────────────────────────────────────
export {
  buildReading,
  getDeviceRow,
  getDeviceRowByUid,
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
export {
  isSafeDeviceId,
  isTimestampValid,
  isWellFormedUid,
  jsonHasNul,
  verifyDeviceHMAC,
  verifyGatewayHMAC,
} from "./domain/hmac.service";
export type { HMACVerifyResult, VerifiedDevice } from "./domain/hmac.service";
export { registerAuthFailure } from "./domain/auth-failure";
export type { AuthFailureResult } from "./domain/auth-failure";
/** Ký/kiểm HMAC bằng secret gateway (lệnh, OTA, ack) — secret không rời module devices (invariant 1, 2). */
export { getGatewaySigner } from "./domain/gateway-signer";
export type { GatewaySigner } from "./domain/gateway-signer";

// ── Ghi trạng thái thiết bị (chủ sở hữu bảng devices) ───────────────────────
export {
  deleteDevicesForTransfer,
  findDevicesByUids,
  findGatewayChildren,
  insertDevice,
  upsertHardwareDevice,
  upsertNodeAppliance,
} from "./infrastructure/device-provisioning.repository";
export type {
  ExistingDeviceRef,
  HardwareDeviceRecord,
  NodeApplianceRecord,
} from "./infrastructure/device-provisioning.repository";
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

/** Đánh dấu một ô mã IR đã học: ac_codes = COALESCE(ac_codes, 0) | mask (NULL coi như 0). */
export async function setDeviceAcCodesBit(deviceDbId: number, mask: number, db?: Queryable): Promise<void> {
  await orAcCodes(deviceDbId, mask, db);
}

/** Nhiệt độ đặt của điều hoà sau khi thiết bị ack lệnh set_temp. */
export async function setDeviceAcSetpoint(deviceDbId: number, setpoint: number, db?: Queryable): Promise<void> {
  await updateAcSetpoint(deviceDbId, setpoint, db);
}

/** % mở của rèm sau khi Node ack lệnh set_pos/turn_on/turn_off. */
export async function setDeviceCurtainPos(deviceDbId: number, position: number, db?: Queryable): Promise<void> {
  await updateCurtainPos(deviceDbId, position, db);
}

// ── Điều hoà IR / rèm / relay thật của Node ─────────────────────────────────
export {
  AC_SETPOINT_MAX,
  AC_SETPOINT_MIN,
  CURTAIN_POS_MAX,
  CURTAIN_POS_MIN,
  isValidAcCodes,
  isValidAcSetpoint,
  isValidCurtainPos,
  learnSlotMask,
  parseLearnAction,
  parseReportedCurtainPos,
  parseSetPosAction,
  parseSetTempAction,
  toLearnAction,
  toSetPosAction,
  toSetTempAction,
} from "./domain/appliance";
export type { LearnSlot } from "./domain/appliance";
/** Telemetry của Node → last_seen + trạng thái các relay thật của nó (điều hoà); dùng chung ingest HTTP + MQTT. */
export { syncNodeAppliances } from "./domain/appliance-sync";
export type { NodeApplianceReport } from "./domain/appliance-sync";
