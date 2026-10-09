// /me/profile, /me/password — controller gộp trong file route (parse → service → HTTP).
import { Router } from "express";
import { requestMeta } from "../../../lib/clientIp";
import { nullableString, optionalString, requireString } from "../../../lib/validate";
import { getAuth } from "../../auth/authContext";
import { changePassword, getProfile, updateProfile } from "./profile.service";

export function createProfileRouter(): Router {
  const router = Router();

  router.get("/me/profile", async (req, res) => {
    res.json(await getProfile(getAuth(req)));
  });

  router.patch("/me/profile", async (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const profile = await updateProfile(getAuth(req), {
      fullName: optionalString(body.full_name, "full_name", { min: 2, max: 128 }),
      // null/"" xoá giá trị (web gửi null)
      phone: nullableString(body.phone, "phone", { max: 20, pattern: /^[0-9 +.-]+$/ }),
      address: nullableString(body.address, "address", { max: 255 }),
    });
    res.json(profile);
  });

  router.post("/me/password", async (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const current = requireString(body.current_password, "current_password", { max: 128, trim: false });
    const next = requireString(body.new_password, "new_password", { min: 8, max: 128, trim: false });
    await changePassword(getAuth(req), current, next, requestMeta(req));
    res.status(204).end();
  });

  return router;
}
