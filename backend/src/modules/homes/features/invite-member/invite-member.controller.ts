// POST /homes/:homeId/members/invite (portal + mobile).
import type { Request, Response } from "express";
import { requestMeta } from "../../../../core/http/request-meta";
import {
  optionalIsoDate,
  parseIdParam,
  requireEmail,
  requireEnum,
  requireIdList,
  requireString,
} from "../../../../shared/validation/validate";
import { getAuth } from "../../../../core/auth/auth-context";
import { INVITE_ROLES } from "../../domain/member.types";
import { inviteMember } from "./invite-member.handler";

export async function inviteMemberController(req: Request, res: Response): Promise<void> {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const role = requireEnum(body.role, "role", INVITE_ROLES);
  const member = await inviteMember(
    getAuth(req),
    parseIdParam(req.params.homeId),
    {
      email: requireEmail(body.email),
      name: requireString(body.name, "name", { max: 128 }),
      role,
      expiresAt: role === "GUEST" ? (optionalIsoDate(body.expires_at, "expires_at") ?? null) : null,
      deviceIds: role === "GUEST" ? requireIdList(body.device_ids, "device_ids", { max: 100 }) : [],
    },
    requestMeta(req)
  );
  res.status(201).json(member);
}
