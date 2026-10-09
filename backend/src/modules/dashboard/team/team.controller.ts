import type { Request, Response } from "express";
import { requestMeta } from "../../../lib/clientIp";
import { HttpError } from "../../../lib/http";
import { optionalEnum, optionalString, parseIdParam, requireEnum, requireString } from "../../../lib/validate";
import { getAuth } from "../../auth/authContext";
import { createStaff, listTeam, patchStaff, removeStaff } from "./team.service";

const USERNAME_RE = /^[a-z0-9._-]{3,32}$/;

export async function listTeamHandler(req: Request, res: Response): Promise<void> {
  res.json(await listTeam(getAuth(req)));
}

export async function createTeamHandler(req: Request, res: Response): Promise<void> {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const created = await createStaff(
    getAuth(req),
    {
      username: requireString(body.username, "username", { min: 3, max: 32, pattern: USERNAME_RE }),
      // Mật khẩu: không trim (khoảng trắng là ký tự hợp lệ)
      password: requireString(body.password, "password", { min: 8, max: 128, trim: false }),
      role: requireEnum(body.role, "role", ["operator"] as const),
    },
    requestMeta(req)
  );
  res.status(201).json(created);
}

export async function patchTeamHandler(req: Request, res: Response): Promise<void> {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const status = optionalEnum(body.status, "status", ["active", "locked"] as const);
  const password = optionalString(body.password, "password", { min: 8, max: 128, trim: false });
  if (status === undefined && password === undefined) throw new HttpError(400, "MISSING_FIELDS", "status or password is required");
  res.json(await patchStaff(getAuth(req), parseIdParam(req.params.id), { status, password }, requestMeta(req)));
}

export async function deleteTeamHandler(req: Request, res: Response): Promise<void> {
  await removeStaff(getAuth(req), parseIdParam(req.params.id), requestMeta(req));
  res.status(204).end();
}
