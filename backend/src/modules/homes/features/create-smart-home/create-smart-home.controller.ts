// POST /api/dashboard/smart-homes.
import type { Request, Response } from "express";
import { requestMeta } from "../../../../core/http/request-meta";
import { optionalString, requireEnum, requireString } from "../../../../shared/validation/validate";
import { PACKAGE_CODES } from "../../../../shared/types/domain";
import { getAuth } from "../../../../core/auth/auth-context";
import { createSmartHome } from "./create-smart-home.handler";

export async function createSmartHomeController(req: Request, res: Response): Promise<void> {
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
