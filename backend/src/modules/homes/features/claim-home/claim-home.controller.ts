// POST /claim (FR-3.1 → 3.7; portal + mobile). Giới hạn 20 lần/giờ theo IP gắn ở core/http/rate-limit.ts;
// giới hạn theo tài khoản/mã ở claim-home.handler.
import type { Request, Response } from "express";
import { requestMeta } from "../../../../core/http/request-meta";
import { HttpError } from "../../../../shared/errors/http-error";
import { isBlank, optionalString } from "../../../../shared/validation/validate";
import { getAuth } from "../../../../core/auth/auth-context";
import { claimHome } from "./claim-home.handler";

export async function claimHomeController(req: Request, res: Response): Promise<void> {
  const body = (req.body ?? {}) as Record<string, unknown>;
  // Độ dài rộng để nhập nhầm vẫn đi tới handler (và được tính vào giới hạn) thay vì 400 lặng lẽ
  const code = optionalString(body.code, "code", { max: 64 });
  const qrPayload = optionalString(body.qr_payload, "qr_payload", { max: 128 });
  if (isBlank(body.code) && isBlank(body.qr_payload)) {
    throw new HttpError(400, "MISSING_FIELDS", "code or qr_payload is required");
  }
  const result = await claimHome(getAuth(req), { code, qrPayload }, requestMeta(req));
  res.status(201).json(result);
}
