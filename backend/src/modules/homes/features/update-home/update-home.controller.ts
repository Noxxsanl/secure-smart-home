// PATCH /homes/:homeId (portal + mobile).
import type { Request, Response } from "express";
import { requestMeta } from "../../../../core/http/request-meta";
import { nullableString, optionalString, parseIdParam } from "../../../../shared/validation/validate";
import { getAuth } from "../../../../core/auth/auth-context";
import { patchHome } from "./update-home.handler";

export async function updateHomeController(req: Request, res: Response): Promise<void> {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const home = await patchHome(
    getAuth(req),
    parseIdParam(req.params.homeId),
    {
      name: optionalString(body.name, "name", { max: 128 }),
      address: nullableString(body.address, "address", { max: 255 }),
    },
    requestMeta(req)
  );
  res.json(home);
}
