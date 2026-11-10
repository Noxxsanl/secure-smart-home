// GET /devices/:deviceId/snapshots — danh sách ảnh chụp của một camera (mới nhất trước).
// requireDeviceAccess: nhà không thuộc quyền / GUEST chưa được cấp thiết bị → 404; thiếu quyền xem → 403 (invariant 6).
// Thiết bị không phải camera → 404 NOT_FOUND (không lộ loại thiết bị cho người không liên quan).
// Chỉ liệt kê ảnh có home_id = nhà hiện tại của camera (ảnh chỉ thuộc về nhà lúc chụp).
import type { AuthContext } from "../../../../core/auth/auth-context";
import { notFound } from "../../../../shared/errors/http-error";
import { requireDeviceAccess } from "../../../devices";
import type { CameraSnapshotSummary } from "../../domain/camera.types";
import { toSnapshotSummary } from "../../domain/camera.types";
import { listSnapshotsByDevice } from "../../infrastructure/camera-snapshot.repository";

export const DEFAULT_SNAPSHOT_LIMIT = 20;
export const MAX_SNAPSHOT_LIMIT = 50;

export interface ListSnapshotsResult {
  device_id: number;
  items: CameraSnapshotSummary[];
}

export async function listCameraSnapshots(auth: AuthContext, deviceId: number, limit: number): Promise<ListSnapshotsResult> {
  const { device } = await requireDeviceAccess(auth, deviceId, "view");
  if (device.category !== "camera") throw notFound("Device not found");
  const rows = device.home_id === null ? [] : await listSnapshotsByDevice(device.id, device.home_id, limit);
  return { device_id: device.id, items: rows.map(toSnapshotSummary) };
}
