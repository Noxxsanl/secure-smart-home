// Thành viên & lời mời (CONTRACT §4.2 Members & invitations).
import { Router } from "express";
import { requestMeta } from "../../../lib/clientIp";
import { HttpError } from "../../../lib/http";
import {
  nullableIsoDate,
  optionalEnum,
  optionalIsoDate,
  parseIdParam,
  requireEmail,
  requireEnum,
  requireIdList,
  requireString,
} from "../../../lib/validate";
import { getAuth } from "../../auth/authContext";
import {
  acceptInvitation,
  declineInvitation,
  inviteMember,
  leaveHome,
  listMembers,
  listMyInvitations,
  patchMember,
  removeMember,
} from "./members.service";

const INVITE_ROLES = ["CONTROLLER", "VIEWER", "GUEST"] as const;

export function createMembersRouter(): Router {
  const router = Router();

  router.get("/homes/:homeId/members", async (req, res) => {
    res.json(await listMembers(getAuth(req), parseIdParam(req.params.homeId)));
  });

  router.post("/homes/:homeId/members/invite", async (req, res) => {
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
  });

  router.patch("/members/:memberId", async (req, res) => {
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
  });

  router.delete("/members/:memberId", async (req, res) => {
    await removeMember(getAuth(req), parseIdParam(req.params.memberId), requestMeta(req));
    res.status(204).end();
  });

  router.post("/homes/:homeId/leave", async (req, res) => {
    await leaveHome(getAuth(req), parseIdParam(req.params.homeId), requestMeta(req));
    res.status(204).end();
  });

  router.get("/invitations", async (req, res) => {
    res.json(await listMyInvitations(getAuth(req)));
  });

  router.post("/invitations/:id/accept", async (req, res) => {
    res.json(await acceptInvitation(getAuth(req), parseIdParam(req.params.id), requestMeta(req)));
  });

  router.post("/invitations/:id/decline", async (req, res) => {
    await declineInvitation(getAuth(req), parseIdParam(req.params.id), requestMeta(req));
    res.status(204).end();
  });

  return router;
}
