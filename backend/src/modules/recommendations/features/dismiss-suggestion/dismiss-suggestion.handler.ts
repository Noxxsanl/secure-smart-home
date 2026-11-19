// Bỏ qua gợi ý thói quen (FR-7.5): đặt 'rejected' + ghi user_feedback trong một transaction.
import type { AuthContext } from "../../../../core/auth/auth-context";
import type { RequestMeta } from "../../../../core/http/request-meta";
import { withTransaction } from "../../../../infrastructure/database/db";
import { HttpError, notFound } from "../../../../shared/errors/http-error";
import { logEvent } from "../../../audit";
import { loadForResponse } from "../../domain/suggestion-access";
import { toSuggestion } from "../../domain/suggestion.mapper";
import type { HabitSuggestion } from "../../domain/suggestion.types";
import { getSuggestion } from "../../infrastructure/suggestions.read-model";
import { insertFeedback, lockSuggestionStatus, markRejected } from "../../infrastructure/suggestions.repository";

export async function dismissSuggestion(
  auth: AuthContext,
  id: number,
  reason: string | null,
  meta: RequestMeta
): Promise<{ suggestion: HabitSuggestion }> {
  const { row } = await loadForResponse(auth, id);
  await withTransaction(async (conn) => {
    const locked = await lockSuggestionStatus(conn, id);
    if (!locked) throw notFound("Suggestion not found");
    if (locked.status !== "pending") throw new HttpError(409, "ALREADY_RESPONDED", "Suggestion was already answered");
    await markRejected(conn, id, auth.userId);
    await insertFeedback(conn, id, auth.userId, "rejected", reason);
  });
  await logEvent({
    eventType: "SUGGESTION_DISMISSED",
    homeId: row.home_id,
    deviceId: row.device_id,
    actorUserId: auth.userId,
    message: `${auth.displayName} bỏ qua gợi ý cho ${row.device_name ?? "thiết bị"} lúc ${row.time_of_day}`,
    ip: meta.ip,
    userAgent: meta.userAgent,
    details: { suggestion_id: id },
  });
  const fresh = await getSuggestion(id);
  if (!fresh) throw notFound("Suggestion not found");
  return { suggestion: toSuggestion(fresh) };
}
