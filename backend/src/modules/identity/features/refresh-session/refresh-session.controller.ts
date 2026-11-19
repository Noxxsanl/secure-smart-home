// POST /api/mobile/auth/refresh  body { refresh_token } → 200 TokenResponse
import type { Request, Response } from "express";
import { requestMeta } from "../../../../core/http/request-meta";
import { parseRefreshTokenBody } from "../../domain/auth-request";
import { refreshMobileSession } from "./refresh-session.handler";

export async function refreshSessionController(req: Request, res: Response): Promise<void> {
  const refreshToken = parseRefreshTokenBody(req);
  res.json(await refreshMobileSession(refreshToken, requestMeta(req)));
}
