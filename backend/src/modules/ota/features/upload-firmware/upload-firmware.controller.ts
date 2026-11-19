import type { NextFunction, Request, Response } from "express";
import { getAuth } from "../../../../core/auth/auth-context";
import { requestMeta } from "../../../../core/http/request-meta";
import { requireAdmin } from "../../../../core/auth/roles";
import { HttpError } from "../../../../shared/errors/http-error";
import { parseUploadFirmwareQuery } from "./upload-firmware.dto";
import { uploadFirmware } from "./upload-firmware.handler";

/** Chặn trước khi express.raw đọc body: không ADMIN thì không cần nhận tới 4 MB. */
export function adminOnly(req: Request, _res: Response, next: NextFunction): void {
  requireAdmin(getAuth(req));
  next();
}

export async function uploadFirmwareController(req: Request, res: Response): Promise<void> {
  const meta = parseUploadFirmwareQuery(req.query);

  // express.raw chỉ điền Buffer khi Content-Type là application/octet-stream
  const data: unknown = req.body;
  if (!Buffer.isBuffer(data)) {
    throw new HttpError(400, "INVALID_INPUT", "Body must be application/octet-stream binary");
  }
  const created = await uploadFirmware(getAuth(req), { ...meta, data }, requestMeta(req));
  res.status(201).json(created);
}
