// Kiểu domain của luật tự động hoá phía khách (CONTRACT §4.2): DTO trả cho Mobile/Portal, input đã kiểm kiểu
// và dạng ghi xuống automation_rules.

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

/** Trường client gửi (đã kiểm kiểu ở controller). undefined = không gửi. */
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

/** Rule đã kiểm đủ ràng buộc chéo, sẵn sàng INSERT/UPDATE. */
export interface RuleWrite {
  name: string;
  triggerType: "sensor_threshold" | "schedule";
  enabled: boolean;
  roomId: number | null;
  sensorType: "TEMPERATURE" | "HUMIDITY" | null;
  operator: ">" | "<" | "=" | null;
  threshold: number | null;
  scheduleTime: string | null;
  scheduleDays: string | null;
  actionDeviceId: number;
  actionCommand: "turn_on" | "turn_off";
}
