// Xoá hàng loạt nhật ký (FR-10.4, chỉ ADMIN).
import type { AuthContext } from "../../../../core/auth/auth-context";
import { requireAdmin } from "../../../../core/auth/roles";
import type { RequestMeta } from "../../../../core/http/request-meta";
import type { LogCategory } from "../../domain/event-catalog";
import { logEvent } from "../../infrastructure/log-event";
import { deleteLogsByIds } from "../../infrastructure/logs.repository";

export async function deleteLogs(auth: AuthContext, category: LogCategory, ids: number[], meta: RequestMeta): Promise<void> {
  requireAdmin(auth);
  const deleted = await deleteLogsByIds(category, ids);
  // Ghi SAU khi xoá: dòng LOGS_DELETED mới sinh ra không nằm trong tập bị xoá
  await logEvent({
    eventType: "LOGS_DELETED",
    actorUserId: auth.userId,
    message: `Quản trị viên ${auth.username} đã xoá ${deleted} dòng nhật ký nhóm "${category}"`,
    ip: meta.ip,
    userAgent: meta.userAgent,
    details: { category, count: deleted },
  });
}
