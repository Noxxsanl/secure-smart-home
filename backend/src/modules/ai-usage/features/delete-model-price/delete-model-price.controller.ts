// DELETE /api/dashboard/ai-usage/prices/:id (chỉ ADMIN). Chi phí đã tính của các lượt cũ giữ nguyên.
import type { Request, Response } from "express";
import { getAuth } from "../../../../core/auth/auth-context";
import { requireAdmin } from "../../../../core/auth/roles";
import { requestMeta } from "../../../../core/http/request-meta";
import { notFound } from "../../../../shared/errors/http-error";
import { parseIdParam } from "../../../../shared/validation/validate";
import { logEvent } from "../../../audit";
import { deletePrice, getPrice } from "../../infrastructure/prices.repository";

export async function deleteModelPriceController(req: Request, res: Response): Promise<void> {
  const auth = getAuth(req);
  requireAdmin(auth);
  const id = parseIdParam(req.params.id);
  const price = await getPrice(id);
  if (!price || (await deletePrice(id)) === 0) throw notFound("Price not found");
  const meta = requestMeta(req);
  await logEvent({
    eventType: "AI_PRICE_UPDATED",
    actorUserId: auth.userId,
    message: `${auth.username} xoá giá ${price.provider}/${price.model}`,
    ip: meta.ip,
    userAgent: meta.userAgent,
    details: { provider: price.provider, model: price.model, deleted: true },
  });
  res.status(204).end();
}
