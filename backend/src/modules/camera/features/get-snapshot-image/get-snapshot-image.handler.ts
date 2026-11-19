// GET /snapshots/:snapshotId/image — trả file JPEG của một ảnh chụp.
// Tra snapshot → camera → requireDeviceAccess(view): snapshot không tồn tại hoặc nhà không thuộc quyền → 404 (không
// phân biệt, invariant 6). Ảnh chỉ thuộc về nhà lúc chụp: snapshot.home_id khác nhà hiện tại của camera (camera đã
// chuyển nhà) hoặc NULL → 404. File mất trên đĩa → 404 NOT_FOUND. Đường dẫn/khoá lưu trữ không bao giờ ra client.
import type { Readable } from "stream";
import type { AuthContext } from "../../../../core/auth/auth-context";
import { notFound } from "../../../../shared/errors/http-error";
import { SnapshotNotFoundError, getSnapshotStore } from "../../../../infrastructure/storage";
import { requireDeviceAccess } from "../../../devices";
import { getSnapshotRow } from "../../infrastructure/camera-snapshot.repository";

export async function openSnapshotImage(auth: AuthContext, snapshotId: number): Promise<Readable> {
  const snapshot = await getSnapshotRow(snapshotId);
  if (!snapshot) throw notFound("Snapshot not found");
  const { device } = await requireDeviceAccess(auth, snapshot.device_id, "view");
  if (snapshot.home_id === null || snapshot.home_id !== device.home_id) throw notFound("Snapshot not found");
  try {
    return await getSnapshotStore().open(snapshot.storage_key);
  } catch (err) {
    if (err instanceof SnapshotNotFoundError) throw notFound("Snapshot file not found");
    throw err;
  }
}
