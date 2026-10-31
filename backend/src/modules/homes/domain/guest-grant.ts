// Kiểm quyền GUEST khi mời / cấp lại (FR-6.x): bắt buộc có hạn ≤ 30 ngày ở tương lai + danh sách thiết bị
// thuộc đúng nhà. Dùng chung bởi invite-member và update-member.
import { HttpError } from "../../../shared/errors/http-error";
import { filterHomeDeviceIds } from "../infrastructure/members.read-model";

const DAY_MS = 24 * 3600 * 1000;
const GUEST_MAX_MS = 30 * DAY_MS;

export async function validateGuestGrant(homeId: number, expiresAt: Date | null, deviceIds: number[]): Promise<void> {
  const now = Date.now();
  if (expiresAt === null) throw new HttpError(400, "INVALID_INPUT", "expires_at is required for GUEST");
  if (expiresAt.getTime() <= now) throw new HttpError(400, "INVALID_INPUT", "expires_at must be in the future");
  if (expiresAt.getTime() > now + GUEST_MAX_MS) throw new HttpError(400, "INVALID_INPUT", "expires_at must be within 30 days");
  if (deviceIds.length === 0) throw new HttpError(400, "INVALID_INPUT", "device_ids must not be empty for GUEST");
  const valid = await filterHomeDeviceIds(homeId, deviceIds);
  if (valid.length !== deviceIds.length) throw new HttpError(400, "INVALID_INPUT", "device_ids must belong to this home");
}
