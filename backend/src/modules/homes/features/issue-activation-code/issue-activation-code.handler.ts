// POST /smart-homes/:id/activation-codes — tạo lại mã kích hoạt cho nhà CHƯA claim (FR-2.4, 2.6): thu hồi mã
// cũ + phát mã mới trong một transaction. `code`/`qr_payload` bản rõ chỉ có trong response, không lưu/log.
import type { RequestMeta } from "../../../../core/http/request-meta";
import type { AuthContext } from "../../../../core/auth/auth-context";
import { withTransaction } from "../../../../infrastructure/database/db";
import { logEvent } from "../../../audit";
import { issueActivationCode } from "../../domain/activation";
import type { ActivationCodeIssued } from "../../domain/home.types";
import { requireHome } from "../../domain/smart-home-detail";

export async function createActivationCode(auth: AuthContext, homeId: number, meta: RequestMeta): Promise<ActivationCodeIssued> {
  const home = await requireHome(homeId);
  const issued = await withTransaction((conn) => issueActivationCode(conn, { homeId, createdBy: auth.userId }));
  await logEvent({
    eventType: "ACTIVATION_CODE_CREATED",
    homeId,
    actorUserId: auth.userId,
    message: `${auth.username} tạo lại mã kích hoạt cho nhà "${home.name}"`,
    ip: meta.ip,
    userAgent: meta.userAgent,
    details: { expires_at: issued.expires_at },
  });
  return issued;
}
