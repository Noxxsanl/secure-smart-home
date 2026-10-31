// POST /smart-homes/:id/assign-owner — Operator/Admin gán chủ nhà (FR-3.x, method 'operator_assign').
// Cùng cơ chế race-safe với claim-home (domain/activation.assignOwner): nhà + mã + thành viên OWNER +
// activation_logs trong MỘT transaction; mã lỗi 409 khi thua cuộc đua là ALREADY_CLAIMED.
import type { RequestMeta } from "../../../../core/http/request-meta";
import type { AuthContext } from "../../../../core/auth/auth-context";
import { withTransaction } from "../../../../infrastructure/database/db";
import { HttpError } from "../../../../shared/errors/http-error";
import { eventBus } from "../../../../shared/events/event-bus";
import { logEvent } from "../../../audit";
import { findActiveCustomerById, findCustomerByTag } from "../../../identity";
import { notifyUser } from "../../../notifications";
import { assignOwner } from "../../domain/activation";
import type { SmartHomeDetailHome } from "../../domain/console-home.types";
import { requireHome, toDetailHome } from "../../domain/smart-home-detail";
import { insertActivationLog } from "../../infrastructure/smart-homes.repository";
import type { AssignOwnerTarget } from "./assign-owner.dto";

export async function assignHomeOwner(
  auth: AuthContext,
  homeId: number,
  target: AssignOwnerTarget,
  meta: RequestMeta
): Promise<SmartHomeDetailHome> {
  const home = await requireHome(homeId);
  if (home.status !== "unclaimed") throw new HttpError(409, "ALREADY_CLAIMED", "Home has already been claimed");

  const customer =
    target.customerId !== undefined
      ? await findActiveCustomerById(target.customerId)
      : target.userTag !== undefined
        ? await findCustomerByTag(target.userTag)
        : null;
  if (!customer) throw new HttpError(404, "CUSTOMER_NOT_FOUND", "Customer not found");

  // Cùng cơ chế race-safe với claim: nhà + mã + thành viên OWNER + activation_logs trong một transaction
  await withTransaction(async (conn) => {
    await assignOwner(conn, {
      homeId,
      userId: customer.user_id,
      actorUserId: auth.userId,
      conflictCode: "ALREADY_CLAIMED",
    });
    await insertActivationLog(conn, {
      homeId,
      userId: customer.user_id,
      method: "operator_assign",
      result: "success",
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
  });

  await logEvent({
    eventType: "OWNER_ASSIGNED",
    homeId,
    actorUserId: auth.userId,
    message: `${auth.username} gán ${customer.name} (${customer.user_tag}) làm chủ nhà "${home.name}"`,
    ip: meta.ip,
    userAgent: meta.userAgent,
    details: { customer_id: customer.id },
  });
  await notifyUser({
    userId: customer.user_id,
    homeId,
    type: "HOME_CLAIMED",
    title: "Bạn đã trở thành chủ nhà",
    message: `Nhà "${home.name}" đã được gán cho bạn. Bạn có thể bắt đầu quản lý thiết bị ngay.`,
    severity: "success",
  });
  eventBus.emit("home_changed", { home_id: homeId });

  return toDetailHome(await requireHome(homeId));
}
