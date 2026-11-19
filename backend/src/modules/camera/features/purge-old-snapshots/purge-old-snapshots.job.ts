// Job dọn ảnh chụp camera hằng giờ: xoá ảnh cũ hơn env.cameraSnapshotRetentionDays (mặc định 7 ngày) rồi giữ tối đa
// 500 ảnh / camera. Với mỗi lô: xoá FILE trước, rồi xoá DÒNG của những ảnh đã xoá file được (file đã mất = bỏ qua, vẫn
// xoá dòng). Lỗi xoá file khác (quyền, I/O) → giữ dòng để lần sau thử lại, và dừng lô để khỏi quay vòng vô hạn.
// Cuối mỗi lượt quét thư mục ảnh: thư mục của deviceId không còn là camera trong DB (thiết bị bị xoá → CASCADE xoá dòng
// camera_snapshots nhưng file vẫn nằm trên đĩa) thì xoá cả thư mục. Chỉ ở mức thư mục — file lẻ không có dòng DB trong
// thư mục camera còn sống (hiếm: INSERT lỗi và xoá lại file cũng lỗi) chưa được dọn.
import { env } from "../../../../config/env";
import { getSnapshotStore } from "../../../../infrastructure/storage";
import { listDeviceRowsByIds } from "../../../devices";
import { MAX_SNAPSHOTS_PER_CAMERA } from "../../domain/camera.types";
import {
  deleteSnapshotsByIds,
  listSnapshotsCreatedBefore,
  listSnapshotsOverCap,
  type PurgeCandidate,
} from "../../infrastructure/camera-snapshot.repository";

const RUN_INTERVAL_MS = 3600 * 1000;
const FIRST_RUN_DELAY_MS = 45_000;
const BATCH_SIZE = 200;
const MAX_BATCHES_PER_RUN = 100;
const DAY_MS = 24 * 3600 * 1000;
const DEVICE_LOOKUP_CHUNK = 500;

/** Xoá file + dòng của một lô; trả số dòng đã xoá. */
async function purgeBatch(batch: readonly PurgeCandidate[]): Promise<number> {
  const store = getSnapshotStore();
  const removable: number[] = [];
  for (const item of batch) {
    try {
      await store.remove(item.storage_key);
      removable.push(item.id);
    } catch (err) {
      console.error("[snapshotRetention] cannot remove file:", err instanceof Error ? err.message : "unknown error");
    }
  }
  return deleteSnapshotsByIds(removable);
}

async function purgeWhile(next: () => Promise<PurgeCandidate[]>): Promise<number> {
  let total = 0;
  for (let i = 0; i < MAX_BATCHES_PER_RUN; i++) {
    const batch = await next();
    if (batch.length === 0) break;
    const deleted = await purgeBatch(batch);
    total += deleted;
    if (deleted === 0 || batch.length < BATCH_SIZE) break;
  }
  return total;
}

/** Xoá thư mục ảnh của camera đã bị xoá khỏi DB (hoặc không còn là camera); trả số thư mục đã xoá. */
async function purgeOrphanDeviceDirs(): Promise<number> {
  const store = getSnapshotStore();
  const dirs = await store.listDeviceDirs();
  let removed = 0;
  for (let i = 0; i < dirs.length; i += DEVICE_LOOKUP_CHUNK) {
    const chunk = dirs.slice(i, i + DEVICE_LOOKUP_CHUNK);
    const rows = await listDeviceRowsByIds(chunk);
    const cameras = new Set(rows.filter((row) => row.category === "camera").map((row) => row.id));
    for (const deviceId of chunk) {
      if (cameras.has(deviceId)) continue;
      try {
        await store.removeDevice(deviceId);
        removed++;
      } catch (err) {
        console.error("[snapshotRetention] cannot remove orphan dir:", err instanceof Error ? err.message : "unknown error");
      }
    }
  }
  return removed;
}

async function runPurgeOnce(): Promise<void> {
  try {
    const cutoff = new Date(Date.now() - env.cameraSnapshotRetentionDays * DAY_MS);
    const expired = await purgeWhile(() => listSnapshotsCreatedBefore(cutoff, BATCH_SIZE));
    const overCap = await purgeWhile(() => listSnapshotsOverCap(MAX_SNAPSHOTS_PER_CAMERA, BATCH_SIZE));
    const orphanDirs = await purgeOrphanDeviceDirs();
    if (expired + overCap + orphanDirs > 0) {
      console.log(
        `[snapshotRetention] deleted ${expired} expired and ${overCap} over-cap snapshots, ${orphanDirs} orphan camera dirs`
      );
    }
  } catch (err) {
    console.error("[snapshotRetention] failed:", err instanceof Error ? err.message : "unknown error");
  }
}

let started = false;

export function startSnapshotRetentionJob(): void {
  if (started) return;
  started = true;
  const first = setTimeout(() => void runPurgeOnce(), FIRST_RUN_DELAY_MS);
  const timer = setInterval(() => void runPurgeOnce(), RUN_INTERVAL_MS);
  first.unref();
  timer.unref();
}
