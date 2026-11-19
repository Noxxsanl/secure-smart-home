// PATCH /api/dashboard/smart-homes/:id.
import type { Request, Response } from "express";
import { requestMeta } from "../../../../core/http/request-meta";
import { HttpError } from "../../../../shared/errors/http-error";
import { nullableString, parseIdParam, requireEnum, requireString } from "../../../../shared/validation/validate";
import { getAuth } from "../../../../core/auth/auth-context";
import type { HomePatch } from "../../domain/console-home.types";
import { patchSmartHome } from "./update-smart-home.handler";

export async function updateSmartHomeController(req: Request, res: Response): Promise<void> {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const patch: HomePatch = {};
  if (body.name !== undefined) patch.name = requireString(body.name, "name", { max: 128 });
  const address = nullableString(body.address, "address", { max: 255 });
  if (address !== undefined) patch.address = address;
  // Chỉ cho phép active ↔ suspended (unclaimed không đặt tay được)
  if (body.status !== undefined) patch.status = requireEnum(body.status, "status", ["active", "suspended"] as const);
  if (Object.keys(patch).length === 0) throw new HttpError(400, "MISSING_FIELDS", "name, address or status is required");
  res.json(await patchSmartHome(getAuth(req), parseIdParam(req.params.id), patch, requestMeta(req)));
}
