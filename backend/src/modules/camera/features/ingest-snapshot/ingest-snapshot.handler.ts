// Sau xác thực: kiểm ảnh JPEG + camera đã gán nhà (home_id NULL → 409 CAMERA_NOT_ASSIGNED, không lưu: ảnh chỉ thuộc
// về nhà lúc chụp, chưa có nhà thì không ai được xem) → lưu file (SnapshotStore) → INSERT camera_snapshots → đánh dấu
// gateway + camera còn sống → phát bus `camera_snapshot` (WebSocket đẩy xuống mobile). Ghi file trước, INSERT sau;
// INSERT lỗi thì xoá lại file để không mồ côi (best effort — nếu xoá cũng lỗi, file chỉ chiếm chỗ chứ không lộ ra ngoài).
import { HttpError } from "../../../../shared/errors/http-error";
import { eventBus } from "../../../../shared/events/event-bus";
import { getSnapshotStore } from "../../../../infrastructure/storage";
import { markDeviceSeen } from "../../../devices";
import { MAX_SNAPSHOT_BYTES, toSnapshotSummary } from "../../domain/camera.types";
import { insertSnapshot } from "../../infrastructure/camera-snapshot.repository";
import type { VerifiedSnapshotRequest } from "./ingest-snapshot.dto";

/** JPEG hợp lệ tối thiểu: có nội dung, không quá cỡ, bắt đầu bằng FF D8 (SOI). */
function assertJpeg(body: unknown): Buffer {
  if (!Buffer.isBuffer(body) || body.length < 4 || body[0] !== 0xff || body[1] !== 0xd8) {
    throw new HttpError(400, "INVALID_IMAGE", "Body must be a JPEG image (Content-Type: image/jpeg)");
  }
  if (body.length > MAX_SNAPSHOT_BYTES) throw new HttpError(413, "PAYLOAD_TOO_LARGE", "Image is too large");
  return body;
}

export async function ingestSnapshot(req: VerifiedSnapshotRequest, body: unknown): Promise<{ snapshot_id: string }> {
  const jpeg = assertJpeg(body);
  const homeId = req.camera.home_id;
  if (homeId === null) throw new HttpError(409, "CAMERA_NOT_ASSIGNED", "Camera is not assigned to a home");
  const store = getSnapshotStore();
  const { key } = await store.put(req.camera.id, jpeg);

  let snapshotId: number;
  try {
    snapshotId = await insertSnapshot({
      deviceId: req.camera.id,
      gatewayId: req.gatewayDbId,
      homeId,
      trigger: req.trigger,
      commandId: req.commandId,
      storageKey: key,
      sizeBytes: jpeg.length,
      capturedAt: req.capturedAt,
    });
  } catch (err) {
    await store.remove(key).catch(() => undefined);
    throw err;
  }

  await markDeviceSeen(req.gatewayDbId, null);
  await markDeviceSeen(req.camera.id, null);

  eventBus.emit("camera_snapshot", {
    home_id: homeId,
    device_id: req.camera.id,
    snapshot: toSnapshotSummary({
      id: snapshotId,
      trigger: req.trigger,
      size_bytes: jpeg.length,
      captured_at: req.capturedAt,
    }),
  });
  return { snapshot_id: String(snapshotId) };
}
