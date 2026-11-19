// PATCH /members/:memberId (portal + mobile).
import type { Request, Response } from "express";
import { requestMeta } from "../../../../core/http/request-meta";
import { HttpError } from "../../../../shared/errors/http-error";
import {
  nullableIsoDate,
  optionalEnum,
  parseIdParam,
  requireIdList,
} from "../../../../shared/validation/validate";
import { getAuth } from "../../../../core/auth/auth-context";
import { INVITE_ROLES } from "../../domain/member.types";
import { patchMember } from "./update-member.handler";

export async function updateMemberController(req: Request, res: Response): Promise<void> {
  const body = (req.body ?? {}) as Record<string, unknown>;
  if (typeof body.role === "string" && body.role === "OWNER") {
    throw new HttpError(400, "INVALID_INPUT", "role OWNER cannot be assigned");
  }
  const member = await patchMember(
    getAuth(req),
    parseIdParam(req.params.memberId),
    {
      role: optionalEnum(body.role, "role", INVITE_ROLES),
      expiresAt: nullableIsoDate(body.expires_at, "expires_at"),
      deviceIds: body.device_ids === undefined ? undefined : requireIdList(body.device_ids, "device_ids", { allowEmpty: true, max: 100 }),
    },
    requestMeta(req)
  );
  res.json(member);
}
