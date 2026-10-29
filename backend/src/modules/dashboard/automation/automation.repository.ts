// SQL automation_rules cho console (đọc là chính; ADMIN được bật/tắt).
import { placeholders, queryOne, queryRows, runSql, toBool, toIso, toIsoRequired, toNumberOrNull, type SqlParam } from "../../../lib/db";
import type { AutomationRuleDto } from "../dashboard.types";

interface RuleRow {
  id: number;
  home_id: number;
  home_name: string;
  name: string;
  is_enabled: boolean;
  trigger_type: "sensor_threshold" | "schedule";
  condition_room_id: number | null;
  room_name: string | null;
  condition_sensor_type: "TEMPERATURE" | "HUMIDITY" | null;
  condition_operator: ">" | "<" | "=" | null;
  condition_threshold_value: string | number | null;
  schedule_time_of_day: string | null;
  schedule_days_of_week: string | null;
  action_device_id: number | null;
  action_device_name: string | null;
  action_command: "turn_on" | "turn_off";
  origin: "user" | "ai_suggested";
  created_by: number | null;
  created_by_name: string | null;
  last_triggered_at: Date | null;
  created_at: Date;
}

const RULE_SELECT_SQL = `
  SELECT r.id, r.home_id, h.name AS home_name, r.name, r.is_enabled, r.trigger_type, r.condition_room_id,
         rm.name AS room_name, r.condition_sensor_type, r.condition_operator, r.condition_threshold_value,
         r.schedule_time_of_day, r.schedule_days_of_week, r.action_device_id, ad.device_name AS action_device_name,
         r.action_command, r.origin, r.created_by, COALESCE(cc.full_name, cu.username, cu.email) AS created_by_name,
         r.last_triggered_at, r.created_at
    FROM automation_rules r
    JOIN smart_homes h ON h.id = r.home_id
    LEFT JOIN rooms rm ON rm.id = r.condition_room_id
    LEFT JOIN devices ad ON ad.id = r.action_device_id
    LEFT JOIN users cu ON cu.id = r.created_by
    LEFT JOIN customers cc ON cc.user_id = r.created_by`;

function parseDays(csv: string | null): number[] | null {
  if (!csv) return null;
  const days = csv
    .split(",")
    .map((part) => Number(part.trim()))
    .filter((day) => Number.isInteger(day) && day >= 1 && day <= 7);
  return days.length > 0 ? days : null;
}

/** `canEdit` = ADMIN; console không xoá rule (can_delete luôn false). */
export function toRuleDto(row: RuleRow, canEdit: boolean): AutomationRuleDto {
  return {
    id: row.id,
    home_id: row.home_id,
    home_name: row.home_name,
    name: row.name,
    enabled: toBool(row.is_enabled),
    trigger_type: row.trigger_type,
    trigger_room_id: row.condition_room_id,
    trigger_room_name: row.room_name,
    trigger_metric: row.condition_sensor_type === null ? null : row.condition_sensor_type === "TEMPERATURE" ? "temperature" : "humidity",
    trigger_operator: row.condition_operator,
    trigger_threshold: toNumberOrNull(row.condition_threshold_value),
    schedule_time: row.schedule_time_of_day,
    schedule_days: parseDays(row.schedule_days_of_week),
    action_device_id: row.action_device_id,
    action_device_name: row.action_device_name,
    action_command: row.action_command,
    origin: row.origin,
    created_by_user_id: row.created_by,
    created_by_name: row.created_by_name,
    last_triggered_at: toIso(row.last_triggered_at),
    created_at: toIsoRequired(row.created_at),
    can_edit: canEdit,
    can_delete: false,
  };
}

export interface RuleFilter {
  homeId?: number;
  /** Operator: chỉ nhà chưa claim + các nhà có grant. undefined = không giới hạn (ADMIN). */
  visibleHomeIds?: readonly number[];
}

export async function listRules(filter: RuleFilter, canEdit: boolean): Promise<AutomationRuleDto[]> {
  const clauses: string[] = [];
  const params: SqlParam[] = [];
  if (filter.homeId !== undefined) {
    clauses.push("r.home_id = ?");
    params.push(filter.homeId);
  }
  if (filter.visibleHomeIds !== undefined) {
    if (filter.visibleHomeIds.length > 0) {
      clauses.push(`(h.status = 'unclaimed' OR r.home_id IN (${placeholders(filter.visibleHomeIds.length)}))`);
      params.push(...filter.visibleHomeIds);
    } else {
      clauses.push("h.status = 'unclaimed'");
    }
  }
  const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
  const rows = await queryRows<RuleRow>(`${RULE_SELECT_SQL} ${where} ORDER BY r.id DESC LIMIT 500`, params);
  return rows.map((row) => toRuleDto(row, canEdit));
}

export async function getRule(id: number, canEdit: boolean): Promise<AutomationRuleDto | null> {
  const row = await queryOne<RuleRow>(`${RULE_SELECT_SQL} WHERE r.id = ?`, [id]);
  return row ? toRuleDto(row, canEdit) : null;
}

/** Bật/tắt rule; reset last_condition_state để engine đánh giá lại cạnh lên từ đầu. */
export async function setRuleEnabled(id: number, enabled: boolean): Promise<void> {
  await runSql("UPDATE automation_rules SET is_enabled = ?, last_condition_state = NULL WHERE id = ?", [enabled, id]);
}
