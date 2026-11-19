// Adapter đĩa cục bộ của SnapshotStore. Cấu trúc: <root>/<deviceDbId>/<YYYY-MM-DD>/<32 hex ngẫu nhiên>.jpg
// (thư mục root lấy từ env SNAPSHOT_STORAGE_DIR, mặc định storage/snapshots — cùng kiểu FIRMWARE_STORAGE_DIR).
//
// Chặn path traversal 2 lớp: (1) khoá phải khớp KEY_PATTERN chặt (không có "..", "/" thừa, ký tự lạ);
// (2) đường dẫn sau khi resolve phải nằm trong root. Tên file do server sinh bằng randomBytes nên client
// không đoán/chỉ định được.
import crypto from "crypto";
import fs from "fs";
import path from "path";
import type { Readable } from "stream";
import { SnapshotNotFoundError, type SnapshotStore } from "./snapshot-store";

const MAX_DEVICE_ID = 2_147_483_647;
const KEY_PATTERN = /^\d{1,10}\/\d{4}-\d{2}-\d{2}\/[0-9a-f]{32}\.jpg$/;

export class LocalDiskSnapshotStore implements SnapshotStore {
  private readonly root: string;

  constructor(rootDir: string) {
    this.root = path.resolve(rootDir);
  }

  /** Khoá → đường dẫn tuyệt đối trong root; null nếu khoá không hợp lệ. */
  private resolveKey(key: string): string | null {
    if (!KEY_PATTERN.test(key)) return null;
    const full = path.resolve(this.root, key);
    return full.startsWith(this.root + path.sep) ? full : null;
  }

  /** deviceId → thư mục <root>/<deviceId> trong root; null nếu deviceId không phải số nguyên dương. */
  private resolveDeviceDir(deviceId: number): string | null {
    if (!Number.isInteger(deviceId) || deviceId < 1) return null;
    const full = path.resolve(this.root, String(deviceId));
    return full.startsWith(this.root + path.sep) ? full : null;
  }

  async put(deviceId: number, jpeg: Buffer): Promise<{ key: string }> {
    if (!Number.isInteger(deviceId) || deviceId < 1) throw new Error("Invalid device id for snapshot");
    const day = new Date().toISOString().slice(0, 10);
    const key = `${deviceId}/${day}/${crypto.randomBytes(16).toString("hex")}.jpg`;
    const full = this.resolveKey(key);
    if (full === null) throw new Error("Generated snapshot key is invalid");
    await fs.promises.mkdir(path.dirname(full), { recursive: true });
    // flag "wx": không bao giờ ghi đè file có sẵn (trùng 128 bit ngẫu nhiên gần như không xảy ra)
    await fs.promises.writeFile(full, jpeg, { flag: "wx", mode: 0o640 });
    return { key };
  }

  async open(key: string): Promise<Readable> {
    const full = this.resolveKey(key);
    if (full === null) throw new SnapshotNotFoundError();
    try {
      await fs.promises.access(full, fs.constants.R_OK);
    } catch {
      throw new SnapshotNotFoundError();
    }
    return fs.createReadStream(full);
  }

  async listDeviceDirs(): Promise<number[]> {
    let entries: fs.Dirent[];
    try {
      entries = await fs.promises.readdir(this.root, { withFileTypes: true });
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw err;
    }
    // Chỉ thư mục tên là số nguyên dương (đúng cấu trúc put() sinh ra); mục lạ khác bị bỏ qua, không bao giờ xoá
    return entries
      .filter((entry) => entry.isDirectory() && /^[1-9]\d{0,9}$/.test(entry.name))
      .map((entry) => Number(entry.name))
      .filter((id) => id <= MAX_DEVICE_ID); // vượt INTEGER của devices.id thì không thể là camera thật (và làm hỏng truy vấn)
  }

  async removeDevice(deviceId: number): Promise<void> {
    const full = this.resolveDeviceDir(deviceId);
    if (full === null) throw new Error("Invalid device id for snapshot directory");
    await fs.promises.rm(full, { recursive: true, force: true });
  }

  async remove(key: string): Promise<void> {
    const full = this.resolveKey(key);
    if (full === null) return;
    try {
      await fs.promises.unlink(full);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    }
  }
}
