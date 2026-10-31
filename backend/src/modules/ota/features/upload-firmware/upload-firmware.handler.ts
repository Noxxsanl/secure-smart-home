// Firmware (FR-9.3): upload nhị phân (ADMIN), tính SHA-256 phía server, lưu theo checksum, đánh dấu stable.
import fs from "fs/promises";
import path from "path";
import { env } from "../../../../config/env";
import type { AuthContext } from "../../../../core/auth/auth-context";
import type { RequestMeta } from "../../../../core/http/request-meta";
import { requireAdmin } from "../../../../core/auth/roles";
import { isDuplicateKeyError } from "../../../../infrastructure/database/db";
import { sha256Hex } from "../../../../shared/crypto";
import { HttpError } from "../../../../shared/errors/http-error";
import { logEvent } from "../../../audit";
import type { FirmwareVersion } from "../../domain/ota.types";
import { getFirmware } from "../../infrastructure/firmware.read-model";
import { firmwareVersionExists, insertFirmware } from "../../infrastructure/firmware.repository";
import type { UploadFirmwareInput } from "./upload-firmware.dto";

export async function uploadFirmware(auth: AuthContext, input: UploadFirmwareInput, meta: RequestMeta): Promise<FirmwareVersion> {
  requireAdmin(auth);
  if (input.data.length === 0) throw new HttpError(400, "INVALID_INPUT", "Firmware body is empty");
  if (await firmwareVersionExists(input.type, input.version)) {
    throw new HttpError(409, "VERSION_EXISTS", "This firmware version already exists");
  }

  const checksum = sha256Hex(input.data);
  // File đặt tên theo SHA-256 (content-addressed): tên do server sinh nên không có path traversal từ file_name,
  // và ghi lại cùng nội dung là idempotent nếu bước INSERT bên dưới thất bại rồi thử lại.
  const dir = path.resolve(env.firmwareStorageDir);
  const storagePath = `${checksum}.bin`;
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, storagePath), input.data);

  let id: number;
  try {
    id = await insertFirmware({
      type: input.type,
      version: input.version,
      fileName: input.fileName,
      sizeBytes: input.data.length,
      checksum,
      storagePath,
      releaseNotes: input.releaseNotes,
      stable: input.stable,
      uploadedBy: auth.userId,
    });
  } catch (err) {
    // Hai upload cùng phiên bản đồng thời: unique key chặn → 409 thay vì 500
    if (isDuplicateKeyError(err, "uq_firmware_type_version")) {
      throw new HttpError(409, "VERSION_EXISTS", "This firmware version already exists");
    }
    throw err;
  }

  await logEvent({
    eventType: "FIRMWARE_UPLOADED",
    actorUserId: auth.userId,
    message: `${auth.username} tải lên firmware ${input.type} ${input.version}`,
    ip: meta.ip,
    userAgent: meta.userAgent,
    details: { firmware_id: id, type: input.type, version: input.version, size_bytes: input.data.length, checksum_sha256: checksum },
  });
  const created = await getFirmware(id);
  if (!created) throw new Error("firmware could not be read back");
  return created;
}
