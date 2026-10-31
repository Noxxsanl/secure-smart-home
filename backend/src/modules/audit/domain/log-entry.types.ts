// DTO Dashboard của nhật ký (CONTRACT_V2 §5). Khớp frontend/packages/console/api/types.ts.
import type { Severity } from "../../../shared/types/domain";
import type { LogCategory } from "./event-catalog";

export interface LogEntry {
  id: number;
  category: LogCategory;
  severity: Severity;
  event_type: string;
  timestamp: string;
  home_id: number | null;
  home_name: string | null;
  gateway_uid: string | null;
  device_uid: string | null;
  actor_username: string | null;
  ip_address: string | null;
  message: string;
  details: Record<string, unknown> | null;
}

/** Bộ lọc truy vấn nhật ký (read model `logs.read-model.ts`). */
export interface LogFilter {
  categories: readonly LogCategory[];
  homeId?: number;
  deviceId?: number;
  severity?: Severity;
  from?: Date;
  to?: Date;
  actor?: string;
  q?: string;
}
