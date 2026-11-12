// Admin thêm/sửa giá model (nguồn "manual"). Có giá → tính bù chi phí cho các lượt gọi trước đó chưa có giá.
import type { AuthContext } from "../../../../core/auth/auth-context";
import { requireAdmin } from "../../../../core/auth/roles";
import type { RequestMeta } from "../../../../core/http/request-meta";
import { isDuplicateKeyError, withTransaction } from "../../../../infrastructure/database/db";
import { HttpError, notFound } from "../../../../shared/errors/http-error";
import { logEvent } from "../../../audit";
import type { ModelPrice, PriceValues } from "../../domain/usage.types";
import { getPrice, insertPrice, updatePrice } from "../../infrastructure/prices.repository";
import { backfillMissingCosts } from "../../infrastructure/usage.repository";

function priceText(values: PriceValues): string {
  if (values.inputUsdPerMtok !== null && values.outputUsdPerMtok !== null) {
    return `${values.inputUsdPerMtok}/${values.outputUsdPerMtok} USD mỗi triệu token vào/ra`;
  }
  return `${values.audioUsdPerMinute} USD/phút`;
}

export async function createModelPrice(
  auth: AuthContext,
  input: { provider: string; model: string; values: PriceValues; sourceUrl: string | null },
  meta: RequestMeta
): Promise<ModelPrice> {
  requireAdmin(auth);
  const id = await withTransaction(async (conn) => {
    let created: number | null;
    try {
      created = await insertPrice(conn, input.provider, input.model, {
        values: input.values,
        source: "manual",
        sourceUrl: input.sourceUrl,
        checkedAt: new Date(),
        updatedBy: auth.userId,
      });
    } catch (err) {
      if (isDuplicateKeyError(err)) throw new HttpError(409, "PRICE_EXISTS", "A price for this model already exists");
      throw err;
    }
    if (created === null) throw new Error("insertPrice returned no id");
    await backfillMissingCosts(conn, input.provider, input.model);
    return created;
  });
  await logEvent({
    eventType: "AI_PRICE_UPDATED",
    actorUserId: auth.userId,
    message: `${auth.username} thêm giá ${input.provider}/${input.model}: ${priceText(input.values)}`,
    ip: meta.ip,
    userAgent: meta.userAgent,
    details: { provider: input.provider, model: input.model },
  });
  const price = await getPrice(id);
  if (!price) throw notFound("Price not found");
  return price;
}

export async function updateModelPrice(
  auth: AuthContext,
  id: number,
  input: { values: PriceValues; sourceUrl: string | null },
  meta: RequestMeta
): Promise<ModelPrice> {
  requireAdmin(auth);
  const current = await getPrice(id);
  if (!current) throw notFound("Price not found");
  await withTransaction(async (conn) => {
    await updatePrice(conn, id, {
      values: input.values,
      source: "manual",
      sourceUrl: input.sourceUrl,
      checkedAt: new Date(),
      updatedBy: auth.userId,
    });
    // Giá mới chỉ áp cho lượt gọi chưa có giá; lượt đã tính giữ chi phí lúc phát sinh
    await backfillMissingCosts(conn, current.provider, current.model);
  });
  await logEvent({
    eventType: "AI_PRICE_UPDATED",
    actorUserId: auth.userId,
    message: `${auth.username} sửa giá ${current.provider}/${current.model}: ${priceText(input.values)}`,
    ip: meta.ip,
    userAgent: meta.userAgent,
    details: { provider: current.provider, model: current.model },
  });
  const price = await getPrice(id);
  if (!price) throw notFound("Price not found");
  return price;
}
