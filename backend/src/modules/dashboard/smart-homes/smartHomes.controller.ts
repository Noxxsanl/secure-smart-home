import type { Request, Response } from "express";
import { requestMeta } from "../../../lib/clientIp";
import { HttpError } from "../../../lib/http";
import {
  isBlank,
  nullableString,
  optionalEnum,
  optionalId,
  optionalString,
  parseIdParam,
  queryString,
  requireEnum,
  requireInt,
  requireString,
} from "../../../lib/validate";
import { HOME_STATUSES, PACKAGE_CODES } from "../../../types/domain";
import { getAuth } from "../../auth/authContext";
import type { HomePatch } from "./smartHomes.repository";
import {
  assignHomeOwner,
  createActivationCode,
  createSmartHome,
  getSmartHomeDetail,
  listSmartHomes,
  patchSmartHome,
  requestHomeAccess,
  revokeActivation,
} from "./smartHomes.service";

export async function listHandler(req: Request, res: Response): Promise<void> {
  res.json(
    await listSmartHomes({
      status: optionalEnum(queryString(req.query.status), "status", HOME_STATUSES),
      q: queryString(req.query.q, 100),
    })
  );
}

export async function createHandler(req: Request, res: Response): Promise<void> {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const result = await createSmartHome(
    getAuth(req),
    {
      name: requireString(body.name, "name", { max: 128 }),
      packageCode: requireEnum(body.package, "package", PACKAGE_CODES),
      address: optionalString(body.address, "address", { max: 255 }),
      expectedOwnerName: optionalString(body.expected_owner_name, "expected_owner_name", { max: 128 }),
    },
    requestMeta(req)
  );
  res.status(201).json(result);
}

export async function detailHandler(req: Request, res: Response): Promise<void> {
  res.json(await getSmartHomeDetail(getAuth(req), parseIdParam(req.params.id), requestMeta(req)));
}

export async function patchHandler(req: Request, res: Response): Promise<void> {
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

export async function assignOwnerHandler(req: Request, res: Response): Promise<void> {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const customerId = optionalId(body.customer_id, "customer_id");
  const userTag = isBlank(body.user_tag) ? undefined : requireString(body.user_tag, "user_tag", { max: 32 });
  if (customerId === undefined && userTag === undefined) {
    throw new HttpError(400, "MISSING_FIELDS", "user_tag or customer_id is required");
  }
  res.json(await assignHomeOwner(getAuth(req), parseIdParam(req.params.id), { userTag, customerId }, requestMeta(req)));
}

export async function createCodeHandler(req: Request, res: Response): Promise<void> {
  res.status(201).json(await createActivationCode(getAuth(req), parseIdParam(req.params.id), requestMeta(req)));
}

export async function revokeCodeHandler(req: Request, res: Response): Promise<void> {
  await revokeActivation(getAuth(req), parseIdParam(req.params.id), requestMeta(req));
  res.status(204).end();
}

export async function accessRequestHandler(req: Request, res: Response): Promise<void> {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const grant = await requestHomeAccess(
    getAuth(req),
    parseIdParam(req.params.id),
    {
      reason: requireString(body.reason, "reason", { min: 5, max: 255 }),
      durationHours: requireInt(body.duration_hours, "duration_hours", { min: 1, max: 24 }),
    },
    requestMeta(req)
  );
  res.status(201).json(grant);
}
