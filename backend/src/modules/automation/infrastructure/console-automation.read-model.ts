// Đọc automation_rules cho console (read-mostly; ADMIN được bật/tắt — phần ghi ở automation-rule.repository.ts).
import { placeholders, queryOne, queryRows, type SqlParam } from "../../../infrastructure/database/db";
import { toConsoleRuleDto, type ConsoleRuleRow } from "../domain/console-rule.mapper";
import type { AutomationRuleDto } from "../domain/console-automation.types";

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
  const rows = await queryRows<ConsoleRuleRow>(`${RULE_SELECT_SQL} ${where} ORDER BY r.id DESC LIMIT 500`, params);
  return rows.map((row) => toConsoleRuleDto(row, canEdit));
}

export async function getRule(id: number, canEdit: boolean): Promise<AutomationRuleDto | null> {
  const row = await queryOne<ConsoleRuleRow>(`${RULE_SELECT_SQL} WHERE r.id = ?`, [id]);
  return row ? toConsoleRuleDto(row, canEdit) : null;
}
