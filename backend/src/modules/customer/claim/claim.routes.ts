// POST /claim (FR-3.1 → 3.7). Giới hạn 20 lần/giờ theo IP gắn ở app.ts; giới hạn theo tài khoản/mã ở service.
import { Router } from "express";
import { requestMeta } from "../../../lib/clientIp";
import { HttpError } from "../../../lib/http";
import { isBlank, optionalString } from "../../../lib/validate";
import { getAuth } from "../../auth/authContext";
import { claimHome } from "./claim.service";

export function createClaimRouter(): Router {
  const router = Router();

  router.post("/claim", async (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    // Độ dài rộng để nhập nhầm vẫn đi tới service (và được tính vào giới hạn) thay vì 400 lặng lẽ
    const code = optionalString(body.code, "code", { max: 64 });
    const qrPayload = optionalString(body.qr_payload, "qr_payload", { max: 128 });
    if (isBlank(body.code) && isBlank(body.qr_payload)) {
      throw new HttpError(400, "MISSING_FIELDS", "code or qr_payload is required");
    }
    const result = await claimHome(getAuth(req), { code, qrPayload }, requestMeta(req));
    res.status(201).json(result);
  });

  return router;
}
