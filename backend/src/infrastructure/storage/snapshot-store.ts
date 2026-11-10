// Port lưu ảnh chụp camera (docs/DESIGN_PATTERNS.md §3.2c): module camera chỉ biết giao diện này, không biết ảnh nằm
// ở đâu. Hiện chỉ có adapter đĩa cục bộ (local-disk-snapshot-store.ts); đổi sang S3/MinIO = viết adapter mới cùng
// giao diện rồi đổi dòng khởi tạo ở index.ts (getSnapshotStore).
//
// `key` là chuỗi mờ do store sinh: lưu trong camera_snapshots.storage_key, KHÔNG bao giờ trả ra client
// (đường dẫn file thật càng không).
import type { Readable } from "stream";

export interface SnapshotStore {
  /** Lưu ảnh JPEG của camera `deviceId` (devices.id); trả khoá để mở/xoá sau này. */
  put(deviceId: number, jpeg: Buffer): Promise<{ key: string }>;
  /** Mở luồng đọc ảnh. Khoá sai định dạng hoặc file mất → ném SnapshotNotFoundError. */
  open(key: string): Promise<Readable>;
  /** Xoá ảnh; file đã mất thì coi như đã xoá (không ném lỗi). */
  remove(key: string): Promise<void>;
  /** devices.id của mọi thư mục ảnh đang có trên đĩa (để job dọn phát hiện camera đã bị xoá khỏi DB). */
  listDeviceDirs(): Promise<number[]>;
  /** Xoá toàn bộ ảnh của một camera (thư mục `<deviceId>/`); chưa có thư mục thì coi như đã xoá. */
  removeDevice(deviceId: number): Promise<void>;
}

/** Khoá không hợp lệ hoặc file không còn trên đĩa — người gọi trả 404. */
export class SnapshotNotFoundError extends Error {
  constructor() {
    super("Snapshot file not found");
    this.name = "SnapshotNotFoundError";
  }
}
