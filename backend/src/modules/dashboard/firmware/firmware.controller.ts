import type { NextFunction, Request, Response } from "express";
import { requestMeta } from "../../../lib/clientIp";
import { HttpError } from "../../../lib/http";
import { optionalBool, optionalId, optionalString, parseIdParam, queryString, requireBool, requireEnum, requireId, requireString } from "../../../lib/validate";
import { getAuth } from "../../auth/authContext";
import { requireAdmin } from "../common/staff";
import { listFirmwareVersions, updateFirmwareStable, uploadFirmware } from "./firmware.service";
import { createDeployment, listOtaDeployments, rollbackDeployment } from "./ota.service";

const FIRMWARE_TYPES = ["gateway", "node"] as const;
const SCOPES = ["fleet", "home"] as const;
const VERSION_RE = /^\d+\.\d+\.\d+(-[0-9A-Za-z.]+)?$/;
const FILE_NAME_RE = /^[A-Za-z0-9._ -]+$/;

export async function listFirmwareHandler(_req: Request, res: Response): Promise<void> {
  res.json(await listFirmwareVersions());
}

/** Chặn trước khi express.raw đọc body: không ADMIN thì không cần nhận tới 4 MB. */
export function adminOnly(req: Request, _res: Response, next: NextFunction): void {
  requireAdmin(getAuth(req));
  next();
}

export async function uploadFirmwareHandler(req: Request, res: Response): Promise<void> {
  const type = requireEnum(queryString(req.query.type), "type", FIRMWARE_TYPES);
  const version = requireString(queryString(req.query.version, 32), "version", { max: 32, pattern: VERSION_RE });
  const stable = optionalBool(queryString(req.query.stable), "stable") ?? false;
  const fileName =
    optionalString(queryString(req.query.file_name, 128), "file_name", { max: 128, pattern: FILE_NAME_RE }) ??
    `${type}-${version}.bin`;
  const releaseNotes = optionalString(queryString(req.query.release_notes, 500), "release_notes", { max: 500 }) ?? null;

  // express.raw chỉ điền Buffer khi Content-Type là application/octet-stream
  const data: unknown = req.body;
  if (!Buffer.isBuffer(data)) {
    throw new HttpError(400, "INVALID_INPUT", "Body must be application/octet-stream binary");
  }
  const created = await uploadFirmware(getAuth(req), { type, version, stable, fileName, releaseNotes, data }, requestMeta(req));
  res.status(201).json(created);
}

export async function patchFirmwareHandler(req: Request, res: Response): Promise<void> {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const stable = requireBool(body.stable, "stable");
  res.json(await updateFirmwareStable(getAuth(req), parseIdParam(req.params.id), stable, requestMeta(req)));
}

export async function listDeploymentsHandler(_req: Request, res: Response): Promise<void> {
  res.json(await listOtaDeployments());
}

export async function createDeploymentHandler(req: Request, res: Response): Promise<void> {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const scope = requireEnum(body.scope, "scope", SCOPES);
  const created = await createDeployment(
    getAuth(req),
    {
      firmwareId: requireId(body.firmware_id, "firmware_id"),
      scope,
      targetHomeId: scope === "home" ? requireId(body.target_home_id, "target_home_id") : (optionalId(body.target_home_id, "target_home_id") ?? null),
    },
    requestMeta(req)
  );
  res.status(201).json(created);
}

export async function rollbackDeploymentHandler(req: Request, res: Response): Promise<void> {
  res.json(await rollbackDeployment(getAuth(req), parseIdParam(req.params.id), requestMeta(req)));
}
