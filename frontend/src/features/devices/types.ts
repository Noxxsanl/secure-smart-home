export type DeviceStatus = "online" | "offline";
export type DeviceRole = "sensor" | "gateway" | "admin-device";
export type DeviceSecurityStatus = "Normal" | "Attack Detected" | "Error";

export type DeviceMetrics = {
  temperature: number;
  humidity: number;
  battery: number;
  signalStrength: number;
  dataSentToday: string;
  uptime: string;
};

export type Device = {
  id: string;
  deviceId: string;
  name: string;
  status: DeviceStatus;
  role: DeviceRole;
  token: string;
  securityStatus: DeviceSecurityStatus;
  lastSeen: string;
  firmwareVersion: string;
  gateway: string;
  isUnderAttack: boolean;
  metrics: DeviceMetrics;
};
