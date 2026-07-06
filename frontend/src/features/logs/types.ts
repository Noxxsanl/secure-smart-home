export type LogLevel = "INFO" | "WARNING" | "ERROR" | "SECURITY";

export type LogEntry = {
  id: string;
  timestamp: string;
  deviceId: string;
  event: string;
  level: LogLevel;
  message: string;
};
