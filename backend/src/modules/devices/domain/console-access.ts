// Tra thiết bị/gateway cho CONSOLE (ADMIN/OPERATOR) và kiểm grant của Operator — dùng chung giữa các feature
// của devices và được devices.facade chia sẻ cho telemetry/control (cùng quy tắc 404/403 ở mọi endpoint console).
import { notFound } from "../../../shared/errors/http-error";
import { requireOperatorHomeAccess } from "../../homes";
import type { AuthContext } from "../../../core/auth/auth-context";
import { getDeviceRow } from "../infrastructure/device.read-model";
import type { DeviceRow } from "./device.types";

export async function requireDevice(id: number): Promise<DeviceRow> {
  const row = await getDeviceRow(id);
  if (!row) throw notFound("Device not found");
  return row;
}

export async function requireGateway(id: number): Promise<DeviceRow> {
  const row = await getDeviceRow(id);
  if (!row || row.device_type !== "gateway") throw notFound("Gateway not found");
  return row;
}

/** Operator + nhà đã claim + chưa có grant → 403 ACCESS_GRANT_REQUIRED (thiết bị chưa gán nhà: bỏ qua). */
export async function ensureHomeAccess(auth: AuthContext, home: { id: number | null; status: string | null }) {
  if (home.id === null || home.status === null) return { restricted: false, grant: null };
  return requireOperatorHomeAccess(auth, { id: home.id, status: home.status as "unclaimed" | "active" | "suspended" });
}
