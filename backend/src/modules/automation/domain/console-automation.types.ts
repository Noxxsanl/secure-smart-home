// DTO Dashboard của tự động hoá (CONTRACT_V2 §5). Khớp frontend/packages/api-client/src/dashboard/types.ts.

export interface AutomationRuleDto {
  id: number;
  home_id: number;
  home_name: string;
  name: string;
  enabled: boolean;
  trigger_type: "sensor_threshold" | "schedule";
  trigger_room_id: number | null;
  trigger_room_name: string | null;
  trigger_metric: "temperature" | "humidity" | null;
  trigger_operator: ">" | "<" | "=" | null;
  trigger_threshold: number | null;
  schedule_time: string | null;
  schedule_days: number[] | null;
  action_device_id: number | null;
  action_device_name: string | null;
  action_command: "turn_on" | "turn_off";
  origin: "user" | "ai_suggested";
  created_by_user_id: number | null;
  created_by_name: string | null;
  last_triggered_at: string | null;
  created_at: string;
  can_edit: boolean;
  can_delete: boolean;
}
