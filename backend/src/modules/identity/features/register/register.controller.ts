// Controller đăng ký khách hàng: parse → registerCustomer → cấp phiên theo kênh.
import type { Request, Response } from "express";
import { requestMeta } from "../../../../core/http/request-meta";
import { createPortalSession, startMobileSession } from "../../domain/session.service";
import { setSessionCookie } from "../../guards/session-cookies";
import { parseRegister } from "./register.dto";
import { registerCustomer } from "./register.handler";

/** POST /api/portal/auth/register → 201 { user } + cookie sh_user */
export async function portalRegisterController(req: Request, res: Response): Promise<void> {
  const meta = requestMeta(req);
  const user = await registerCustomer(parseRegister(req), "portal", meta);
  const session = createPortalSession(user);
  setSessionCookie(res, session.portal, session.token, session.ttlSeconds);
  res.status(201).json({ user: session.user });
}

/** POST /api/mobile/auth/register → 201 TokenResponse */
export async function mobileRegisterController(req: Request, res: Response): Promise<void> {
  const meta = requestMeta(req);
  const user = await registerCustomer(parseRegister(req), "mobile", meta);
  res.status(201).json(await startMobileSession(user, meta));
}
