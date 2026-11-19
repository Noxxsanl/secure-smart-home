// Input của POST /homes/:homeId/members/invite (đã validate ở controller).
import type { MemberRole } from "../../../../shared/types/domain";

export interface InviteInput {
  email: string;
  name: string;
  role: Exclude<MemberRole, "OWNER">;
  expiresAt: Date | null;
  deviceIds: number[];
}
