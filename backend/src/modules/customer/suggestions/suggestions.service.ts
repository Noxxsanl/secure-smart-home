// Gợi ý thói quen AI (FR-7.5, 7.6). Invariant 8: gợi ý KHÔNG bao giờ tự điều khiển thiết bị —
// chỉ khi khách chấp nhận mới sinh một rule lịch (rule là bên duy nhất thực thi, do automation engine chạy).
import type { RequestMeta } from "../../../lib/clientIp";
import { toIso, toIsoRequired, withTransaction } from "../../../lib/db";
import { HttpError, notFound } from "../../../lib/http";
import { assertHomeWritable } from "../../access/permissions";
import { requireHomeMember } from "../../access/access.service";
import type { AuthContext } from "../../auth/auth.types";
import { logEvent } from "../../logs/logEvent";
import { getRule, insertRule, findRelayOfHome } from "../automation/automation.repository";
import { toRuleDto, type AutomationRule } from "../automation/automation.service";
import {
  getSuggestion,
  insertFeedback,
  listSuggestions,
  lockSuggestionStatus,
  markConfirmed,
  markRejected,
  type SuggestionRow,
} from "./suggestions.repository";

export interface HabitSuggestion {
  id: number;
  home_id: number;
  device_id: number | null;
  device_name: string;
  room_name: string | null;
  action: "turn_on" | "turn_off";
  time_of_day: string;
  days_matched: number;
  window_days: number;
  status: "pending" | "accepted" | "dismissed";
  created_at: string;
  responded_at: string | null;
  rule_id: number | null;
}

function toSuggestion(row: SuggestionRow): HabitSuggestion {
  return {
    id: row.id,
    home_id: row.home_id,
    device_id: row.device_id,
    device_name: row.device_name ?? "",
    room_name: row.room_name,
    action: row.action,
    time_of_day: row.time_of_day,
    days_matched: row.days_matched,
    window_days: row.window_days,
    // confirmed → accepted; rejected/expired → dismissed
    status: row.status === "pending" ? "pending" : row.status === "confirmed" ? "accepted" : "dismissed",
    created_at: toIsoRequired(row.presented_at),
    responded_at: toIso(row.responded_at),
    rule_id: row.created_rule_id,
  };
}

export async function listHomeSuggestions(auth: AuthContext, homeId: number): Promise<HabitSuggestion[]> {
  await requireHomeMember(auth, homeId, "view_automation");
  return (await listSuggestions(homeId)).map(toSuggestion);
}

async function loadForResponse(auth: AuthContext, id: number): Promise<{ row: SuggestionRow; homeName: string; permissions: Awaited<ReturnType<typeof requireHomeMember>> }> {
  const row = await getSuggestion(id);
  if (!row) throw notFound("Suggestion not found");
  const access = await requireHomeMember(auth, row.home_id, "create_automation");
  assertHomeWritable(access.home);
  return { row, homeName: access.home.name, permissions: access };
}

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
