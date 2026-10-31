// Chấp nhận gợi ý thói quen (FR-7.5, 7.6). Invariant 8: gợi ý KHÔNG bao giờ tự điều khiển thiết bị —
// chỉ khi khách chấp nhận mới sinh một rule lịch (rule là bên duy nhất thực thi, do automation engine chạy).
import type { AuthContext } from "../../../../core/auth/auth-context";
import type { RequestMeta } from "../../../../core/http/request-meta";
import { withTransaction } from "../../../../infrastructure/database/db";
import { HttpError, notFound } from "../../../../shared/errors/http-error";
import { logEvent } from "../../../audit";
import { findRelayOfHome, getRule, insertRule, toRuleDto } from "../../../automation";
import type { AutomationRule } from "../../../automation";
import { loadForResponse } from "../../domain/suggestion-access";
import { toSuggestion } from "../../domain/suggestion.mapper";
import type { HabitSuggestion } from "../../domain/suggestion.types";
import { getSuggestion } from "../../infrastructure/suggestions.read-model";
import { insertFeedback, lockSuggestionStatus, markConfirmed } from "../../infrastructure/suggestions.repository";

/**
 * Chấp nhận: MỘT transaction gồm tạo rule lịch (origin 'ai_suggested', mọi ngày) + đặt gợi ý 'confirmed'
 * kèm created_rule_id + ghi user_feedback 'accepted'. Gợi ý đã phản hồi → 409 ALREADY_RESPONDED.
 */
export async function acceptSuggestion(
  auth: AuthContext,
  id: number,
  meta: RequestMeta
): Promise<{ suggestion: HabitSuggestion; rule: AutomationRule }> {
  const { row, permissions } = await loadForResponse(auth, id);
  if (row.device_id === null || (await findRelayOfHome(row.home_id, row.device_id)) === null) {
    throw new HttpError(409, "DEVICE_UNAVAILABLE", "The suggested device no longer exists in this home");
  }
  const deviceId = row.device_id;
  const verb = row.action === "turn_on" ? "Bật" : "Tắt";

  const ruleId = await withTransaction(async (conn) => {
    const locked = await lockSuggestionStatus(conn, id);
    if (!locked) throw notFound("Suggestion not found");
    if (locked.status !== "pending") throw new HttpError(409, "ALREADY_RESPONDED", "Suggestion was already answered");
    const created = await insertRule(conn, {
      homeId: row.home_id,
      name: `${verb} ${row.device_name ?? "thiết bị"} lúc ${row.time_of_day}`.slice(0, 128),
      triggerType: "schedule",
      enabled: true,
      roomId: null,
      sensorType: null,
      operator: null,
      threshold: null,
      scheduleTime: row.time_of_day,
      scheduleDays: "1,2,3,4,5,6,7",
      actionDeviceId: deviceId,
      actionCommand: row.action,
      createdBy: auth.userId,
      origin: "ai_suggested",
      recommendationId: id,
    });
    await markConfirmed(conn, id, auth.userId, created);
    await insertFeedback(conn, id, auth.userId, "accepted", null);
    return created;
  });

  await logEvent({
    eventType: "SUGGESTION_ACCEPTED",
    homeId: row.home_id,
    deviceId,
    actorUserId: auth.userId,
    message: `${auth.displayName} chấp nhận gợi ý: ${verb.toLowerCase()} ${row.device_name ?? "thiết bị"} lúc ${row.time_of_day}`,
    ip: meta.ip,
    userAgent: meta.userAgent,
    details: { suggestion_id: id, rule_id: ruleId },
  });
  await logEvent({
    eventType: "AUTOMATION_CREATED",
    homeId: row.home_id,
    actorUserId: auth.userId,
    message: `Quy tắc tự động được tạo từ gợi ý AI #${id}`,
    details: { rule_id: ruleId, origin: "ai_suggested" },
  });

  const [fresh, rule] = await Promise.all([getSuggestion(id), getRule(ruleId)]);
  if (!fresh || !rule) throw notFound("Suggestion not found");
  return { suggestion: toSuggestion(fresh), rule: toRuleDto(rule, permissions, auth.userId) };
}
