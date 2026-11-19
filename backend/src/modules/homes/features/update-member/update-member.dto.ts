// Input của PATCH /members/:memberId (đã validate ở controller).
import type { MemberRole } from "../../../../shared/types/domain";

export interface PatchMemberInput {
  role?: Exclude<MemberRole, "OWNER">;
  /** undefined = không đổi; null = xoá hạn (chỉ hợp lệ khi vai trò kết quả không phải GUEST). */
  expiresAt?: Date | null;
  deviceIds?: number[];
}
