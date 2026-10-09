// Automation CRUD + lịch sử (FR-7.1, 7.2). Quyền: xem = view_automation (GUEST 403); tạo = create_automation;
// sửa/xoá = OWNER mọi rule, CONTROLLER chỉ rule của mình (canEditRule). Nhà suspended → 409 HOME_SUSPENDED.
import pool from "../../../config/db";
import type { RequestMeta } from "../../../lib/clientIp";
import { toBool, toIso, toIsoRequired, toNumberOrNull } from "../../../lib/db";
import { HttpError, forbidden, notFound } from "../../../lib/http";
import { parseHhmm } from "../../../lib/time";
import { assertHomeWritable, canEditRule } from "../../access/permissions";
import { requireHomeMember } from "../../access/access.service";
import type { HomeAccess } from "../../access/access.types";
import type { AuthContext } from "../../auth/auth.types";
import { logEvent } from "../../logs/logEvent";
import {
  deleteRule,
  findRelayOfHome,
  getRule,
  insertRule,
  listHistory,
  listRules,
  roomHasSensor,
  updateRule,
  type RuleRow,
  type RuleWrite,
} from "./automation.repository";

export type TriggerType = "sensor_threshold" | "schedule";
export type Metric = "temperature" | "humidity";
export type Operator = ">" | "<" | "=";
export type RuleCommand = "turn_on" | "turn_off";

export interface AutomationRule {
  id: number;
  home_id: number;
  home_name: string;
  name: string;
  enabled: boolean;
  trigger_type: TriggerType;
  trigger_room_id: number | null;
  trigger_room_name: string | null;
  trigger_metric: Metric | null;
  trigger_operator: Operator | null;
  trigger_threshold: number | null;
  schedule_time: string | null;
  schedule_days: number[] | null;
  action_device_id: number | null;
  action_device_name: string | null;
  action_command: RuleCommand;
  origin: "user" | "ai_suggested";
  created_by_user_id: number | null;
  created_by_name: string | null;
  last_triggered_at: string | null;
  created_at: string;
  can_edit: boolean;
  can_delete: boolean;
}

/** Trường client gửi (đã kiểm kiểu ở route). undefined = không gửi. */
export interface RuleInput {
  name?: string;
  enabled?: boolean;
  triggerType?: TriggerType;
  roomId?: number | null;
  metric?: Metric | null;
  operator?: Operator | null;
  threshold?: number | null;
  scheduleTime?: string | null;
  scheduleDays?: number[] | null;
  actionDeviceId?: number;
  actionCommand?: RuleCommand;
}

const METRIC_TO_SQL: Record<Metric, "TEMPERATURE" | "HUMIDITY"> = { temperature: "TEMPERATURE", humidity: "HUMIDITY" };
const SQL_TO_METRIC: Record<"TEMPERATURE" | "HUMIDITY", Metric> = { TEMPERATURE: "temperature", HUMIDITY: "humidity" };

export function toRuleDto(row: RuleRow, access: Pick<HomeAccess, "permissions">, userId: number): AutomationRule {
  const editable = canEditRule(access, row.created_by, userId);
  const days = row.schedule_days_of_week
    ? row.schedule_days_of_week
        .split(",")
        .map((part) => Number(part))
        .filter((day) => Number.isInteger(day) && day >= 1 && day <= 7)
    : null;
  return {
    id: row.id,
    home_id: row.home_id,
    home_name: row.home_name,
    name: row.name,
    enabled: toBool(row.is_enabled),
    trigger_type: row.trigger_type,
    trigger_room_id: row.condition_room_id,
    trigger_room_name: row.condition_room_name,
    trigger_metric: row.condition_sensor_type ? SQL_TO_METRIC[row.condition_sensor_type] : null,
    trigger_operator: row.condition_operator,
    trigger_threshold: toNumberOrNull(row.condition_threshold_value),
    schedule_time: row.schedule_time_of_day,
    schedule_days: days,
    action_device_id: row.action_device_id,
    action_device_name: row.action_device_name,
    action_command: row.action_command,
    origin: row.origin,
    created_by_user_id: row.created_by,
    created_by_name: row.created_by_name,
    last_triggered_at: toIso(row.last_triggered_at),
    created_at: toIsoRequired(row.created_at),
    can_edit: editable,
    can_delete: editable,
  };
}

function invalid(detail: string): HttpError {
  return new HttpError(400, "INVALID_INPUT", detail);
}

function missing(field: string): HttpError {
  return new HttpError(400, "MISSING_FIELDS", `${field} is required`);
}

function writeFromRow(row: RuleRow): RuleWrite {
  return {
    name: row.name,
    triggerType: row.trigger_type,
    enabled: toBool(row.is_enabled),
    roomId: row.condition_room_id,
    sensorType: row.condition_sensor_type,
    operator: row.condition_operator,
    threshold: toNumberOrNull(row.condition_threshold_value),
    scheduleTime: row.schedule_time_of_day,
    scheduleDays: row.schedule_days_of_week,
    actionDeviceId: row.action_device_id ?? 0,
    actionCommand: row.action_command,
  };
}

/**
 * Trộn `base` (rule hiện có, null khi tạo) với `input` rồi kiểm TOÀN BỘ rule:
 *   sensor_threshold → phòng thuộc nhà + có cảm biến, metric, toán tử, ngưỡng số;
 *   schedule → HH:MM hợp lệ + ngày ⊂ 1..7 không rỗng; thiết bị hành động phải là relay của nhà.
 * Trường của loại trigger kia bị xoá về NULL để không rò dữ liệu cũ.
 */
async function buildWrite(homeId: number, base: RuleWrite | null, input: RuleInput): Promise<RuleWrite> {
  const name = input.name ?? base?.name;
  if (name === undefined) throw missing("name");
  const triggerType = input.triggerType ?? base?.triggerType;
  if (triggerType === undefined) throw missing("trigger_type");
  const actionDeviceId = input.actionDeviceId ?? (base && base.actionDeviceId > 0 ? base.actionDeviceId : undefined);
  if (actionDeviceId === undefined) throw missing("action_device_id");
  const actionCommand = input.actionCommand ?? base?.actionCommand;
  if (actionCommand === undefined) throw missing("action_command");

  if ((await findRelayOfHome(homeId, actionDeviceId)) === null) {
    throw invalid("action_device_id must be a relay of this home");
  }

  const write: RuleWrite = {
    name,
    triggerType,
    enabled: input.enabled ?? base?.enabled ?? true,
    roomId: null,
    sensorType: null,
    operator: null,
    threshold: null,
    scheduleTime: null,
    scheduleDays: null,
    actionDeviceId,
    actionCommand,
  };

  if (triggerType === "sensor_threshold") {
    const roomId = input.roomId !== undefined ? input.roomId : (base?.roomId ?? null);
    const metric = input.metric !== undefined ? input.metric : (base?.sensorType ? SQL_TO_METRIC[base.sensorType] : null);
    const operator = input.operator !== undefined ? input.operator : (base?.operator ?? null);
    const threshold = input.threshold !== undefined ? input.threshold : (base?.threshold ?? null);
    if (roomId === null) throw missing("trigger_room_id");
    if (metric === null) throw missing("trigger_metric");
    if (operator === null) throw missing("trigger_operator");
    if (threshold === null) throw missing("trigger_threshold");
    const hasSensor = await roomHasSensor(homeId, roomId);
    if (hasSensor === null) throw invalid("trigger_room_id must belong to this home");
    if (!hasSensor) throw invalid("trigger_room_id has no climate sensor");
    write.roomId = roomId;
    write.sensorType = METRIC_TO_SQL[metric];
    write.operator = operator;
    write.threshold = threshold;
  } else {
    const time = input.scheduleTime !== undefined ? input.scheduleTime : (base?.scheduleTime ?? null);
    let days: number[] | null;
    if (input.scheduleDays !== undefined) days = input.scheduleDays;
    else days = base?.scheduleDays ? base.scheduleDays.split(",").map(Number) : null;
    if (time === null) throw missing("schedule_time");
    if (days === null) throw missing("schedule_days");
    if (parseHhmm(time) === null) throw invalid("schedule_time must be HH:MM (00:00-23:59)");
    const unique = [...new Set(days)].sort((a, b) => a - b);
    if (unique.length === 0 || unique.some((day) => !Number.isInteger(day) || day < 1 || day > 7)) {
      throw invalid("schedule_days must be a non-empty list of integers 1..7");
    }
    write.scheduleTime = time;
    write.scheduleDays = unique.join(",");
  }
  return write;
}

export async function listAutomations(auth: AuthContext, homeId: number): Promise<AutomationRule[]> {
  const access = await requireHomeMember(auth, homeId, "view_automation");
  const rows = await listRules(homeId);
  return rows.map((row) => toRuleDto(row, access, auth.userId));
}

export async function createAutomation(auth: AuthContext, homeId: number, input: RuleInput, meta: RequestMeta): Promise<AutomationRule> {
  const access = await requireHomeMember(auth, homeId, "create_automation");
  assertHomeWritable(access.home);
  const write = await buildWrite(homeId, null, input);
  const id = await insertRule(pool, { ...write, homeId, createdBy: auth.userId, origin: "user" });
  await logEvent({
    eventType: "AUTOMATION_CREATED",
    homeId,
    actorUserId: auth.userId,
    message: `${auth.displayName} tạo quy tắc "${write.name}"`,
    ip: meta.ip,
    userAgent: meta.userAgent,
    details: { rule_id: id, trigger_type: write.triggerType },
  });
  const row = await getRule(id);
  if (!row) throw notFound("Rule not found");
  return toRuleDto(row, access, auth.userId);
}

/** Nạp rule + kiểm quyền sửa. Rule của nhà không thuộc quyền → 404; CONTROLLER sửa rule người khác → 403. */
async function loadEditableRule(auth: AuthContext, ruleId: number): Promise<{ row: RuleRow; access: HomeAccess }> {
  const row = await getRule(ruleId);
  if (!row) throw notFound("Rule not found");
  const access = await requireHomeMember(auth, row.home_id, "create_automation");
  assertHomeWritable(access.home);
  if (!canEditRule(access, row.created_by, auth.userId)) throw forbidden("Only the rule creator or the owner can modify this rule");
  return { row, access };
}

export async function patchAutomation(auth: AuthContext, ruleId: number, input: RuleInput, meta: RequestMeta): Promise<AutomationRule> {
  const { row, access } = await loadEditableRule(auth, ruleId);
  const write = await buildWrite(row.home_id, writeFromRow(row), input);
  await updateRule(row.id, write);
  await logEvent({
    eventType: "AUTOMATION_UPDATED",
    homeId: row.home_id,
    actorUserId: auth.userId,
    message: `${auth.displayName} cập nhật quy tắc "${write.name}"`,
    ip: meta.ip,
    userAgent: meta.userAgent,
    details: { rule_id: row.id, enabled: write.enabled },
  });
  const fresh = await getRule(row.id);
  if (!fresh) throw notFound("Rule not found");
  return toRuleDto(fresh, access, auth.userId);
}

export async function deleteAutomation(auth: AuthContext, ruleId: number, meta: RequestMeta): Promise<void> {
  const { row } = await loadEditableRule(auth, ruleId);
  await deleteRule(row.id);
  await logEvent({
    eventType: "AUTOMATION_DELETED",
    homeId: row.home_id,
    actorUserId: auth.userId,
    message: `${auth.displayName} xoá quy tắc "${row.name}"`,
    ip: meta.ip,
    userAgent: meta.userAgent,
    details: { rule_id: row.id },
  });
}

export interface HistoryEntry {
  id: number;
  triggered_at: string;
  result: "success" | "failed" | "skipped";
  details: unknown;
}

function parseDetails(value: unknown): unknown {
  if (Buffer.isBuffer(value)) value = value.toString("utf8");
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }
  return value ?? null;
}

export async function getAutomationHistory(auth: AuthContext, ruleId: number, limit: number): Promise<HistoryEntry[]> {
  const row = await getRule(ruleId);
  if (!row) throw notFound("Rule not found");
  await requireHomeMember(auth, row.home_id, "view_automation");
  const rows = await listHistory(ruleId, limit);
  return rows.map((item) => ({
    id: item.id,
    triggered_at: toIsoRequired(item.triggered_at),
    result: item.result,
    details: parseDetails(item.details),
  }));
}
