// Khởi tạo store dùng chung của tiến trình. Đổi nơi lưu ảnh (S3/MinIO…) = đổi đúng dòng khởi tạo ở đây.
import { env } from "../../config/env";
import { LocalDiskSnapshotStore } from "./local-disk-snapshot-store";
import type { SnapshotStore } from "./snapshot-store";

export { SnapshotNotFoundError } from "./snapshot-store";
export type { SnapshotStore } from "./snapshot-store";

let instance: SnapshotStore | null = null;

/** Khởi tạo lười để không đụng đĩa lúc import. */
export function getSnapshotStore(): SnapshotStore {
  instance ??= new LocalDiskSnapshotStore(env.snapshotStorageDir);
  return instance;
}
