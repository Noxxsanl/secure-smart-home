// PATCH /smart-homes/:id — sửa tên/địa chỉ/trạng thái nhà (CONTRACT_V2 §5). ADMIN sửa mọi nhà; OPERATOR chỉ
// sửa tên/địa chỉ nhà chưa claim; chỉ ADMIN đổi trạng thái active ↔ suspended (nhà unclaimed → 409).
import type { RequestMeta } from "../../../../core/http/request-meta";
import type { AuthContext } from "../../../../core/auth/auth-context";
import { HttpError, forbidden } from "../../../../shared/errors/http-error";
import { eventBus } from "../../../../shared/events/event-bus";
import { logEvent } from "../../../audit";
import { notifyHomeMembers } from "../../../notifications";
import type { HomePatch, SmartHomeDetailHome } from "../../domain/console-home.types";
import { requireHome, toDetailHome } from "../../domain/smart-home-detail";
import { updateHome } from "../../infrastructure/smart-homes.repository";

export async function patchSmartHome(
  auth: AuthContext,
  homeId: number,
  patch: HomePatch,
  meta: RequestMeta
): Promise<SmartHomeDetailHome> {
  const home = await requireHome(homeId);

  if (patch.name !== undefined || patch.address !== undefined) {
    // ADMIN sửa mọi nhà; OPERATOR chỉ nhà chưa claim (nhà đã có chủ là dữ liệu khách)
    if (auth.role !== "admin" && home.status !== "unclaimed") throw forbidden("Operators may only edit unclaimed homes");
  }
  if (patch.status !== undefined) {
    if (auth.role !== "admin") throw forbidden("Only admins can change home status");
    if (home.status === "unclaimed") throw new HttpError(409, "HOME_NOT_CLAIMED", "Unclaimed homes cannot be suspended or activated");
  }

  await updateHome(homeId, patch);

  if (patch.name !== undefined && patch.name !== home.name) {
    await logEvent({
      eventType: "HOME_RENAMED",
      homeId,
      actorUserId: auth.userId,
      message: `${auth.username} đổi tên nhà "${home.name}" thành "${patch.name}"`,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
  }
  if (patch.status !== undefined && patch.status !== home.status) {
    const suspended = patch.status === "suspended";
    await logEvent({
      eventType: "HOME_STATUS_CHANGED",
      homeId,
      actorUserId: auth.userId,
      message: suspended
        ? `${auth.username} tạm ngưng nhà "${home.name}"`
        : `${auth.username} mở lại hoạt động nhà "${home.name}"`,
      ip: meta.ip,
      userAgent: meta.userAgent,
      details: { from: home.status, to: patch.status },
    });
    await notifyHomeMembers({
      homeId,
      type: "HOME_STATUS",
      title: suspended ? "Nhà của bạn đã bị tạm ngưng" : "Nhà của bạn đã hoạt động trở lại",
      message: suspended
        ? `Nhà "${home.name}" đang bị tạm ngưng nên bạn chưa thể điều khiển thiết bị. Vui lòng liên hệ hỗ trợ.`
        : `Nhà "${home.name}" đã được mở lại, bạn có thể tiếp tục sử dụng bình thường.`,
      severity: suspended ? "warning" : "success",
    });
  }
  eventBus.emit("home_changed", { home_id: homeId });

  return toDetailHome(await requireHome(homeId));
}
