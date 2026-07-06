export type ApiDeviceStatus = "active" | "inactive" | "blocked";
export type ApiDeviceType = "sensor" | "gateway";

export type ApiDevice = {
  id: number;
  device_id: string;
  device_name: string;
  device_type: ApiDeviceType;
  status: ApiDeviceStatus;
  location: string;
  last_seen: string | null;
  fail_count: number;
  created_by: number;
};

export type RegisterDeviceResponse = {
  success: boolean;
  device: {
    id: number;
    device_id: string;
    device_name: string;
    device_type: ApiDeviceType;
    status: ApiDeviceStatus;
    location: string | null;
    secret_key: string;
  };
};

export type DashboardStats = {
  total_gateway: number;
  total_sensor: number;
  gateway_online: number;
  sensor_online: number;
  total_data_points: number;
};

export type ApiSensorPayload = {
  temperature?: number;
  humidity?: number;
  [key: string]: unknown;
};

export type ApiSensorData = {
  id: number;
  device_id: number | string;
  gateway_id: number | string;
  payload: ApiSensorPayload;
  received_at: string;
};

export type ApiDeviceDetail = ApiDevice & {
  recent_data?: ApiSensorData[];
};

export type AuditEventType =
  | "GATEWAY_AUTH_FAIL"
  | "SENSOR_AUTH_FAIL"
  | "DATA_RECV"
  | "DEVICE_REGISTER"
  | "DEVICE_BLOCKED"
  | "DEVICE_STATUS_CHANGE"
  | "DEVICE_DELETE"
  | string;

export type AuditLogEntry = {
  id: number;
  event_type: AuditEventType;
  device_id: number | null;
  device_identifier: string | null;
  device_name: string | null;
  ip_address: string | null;
  device_ip: string | null;
  user_agent: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
};

export type ApiUser = {
  id: number;
  username: string;
  role: "admin" | "operator";
  created_at: string;
  last_login: string | null;
};

export type AppNotification = {
  id: number;
  title: string;
  message: string;
  type: string;
  actor_id: number;
  actor_username: string;
  actor_role: string;
  target_role: string;
  related_device_id: number | null;
  is_read: boolean;
  created_at: string;
};

export type NotificationsResponse = {
  notifications: AppNotification[];
  unread_count: number;
};
