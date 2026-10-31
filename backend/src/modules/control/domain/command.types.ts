// Kiểu công khai của domain điều khiển (CONTRACT_V2 §4.2 commands, §5 Gateways, §7 MQTT).
import type { RequestMeta } from "../../../core/http/request-meta";
import type { DeviceAction, DeviceRow, GatewayAction } from "../../devices";
import type { BehaviorSource } from "./behavior.types";

export type CommandSource = "user" | "automation" | "operator";
export type CommandChannel = "mobile" | "web" | "dashboard" | "system";

export interface SendDeviceCommandInput {
  deviceId: number;
  action: DeviceAction;
  /** users.id người ra lệnh (null khi automation/hệ thống). */
  issuedBy: number | null;
  source: CommandSource;
  channel: CommandChannel;
  /** Ghi đè nguồn trong user_behavior_logs — automation engine truyền 'ai_suggested' cho rule sinh từ gợi ý. */
  behaviorSource?: BehaviorSource;
  /** IP/User-Agent của request để ghi audit (không có thì bỏ trống). */
  meta?: Partial<RequestMeta>;
}

/** Khớp CONTRACT §4.2: `command: { id, action, status: "acked", issued_at, acked_at }`. */
export interface CommandSummary {
  id: number;
  action: DeviceAction;
  status: "acked";
  issued_at: string;
  acked_at: string;
}

export interface SendDeviceCommandResult {
  command: CommandSummary;
  /** Trạng thái thiết bị SAU lệnh (power_state đã cập nhật) — người gọi map sang CustomerDevice/ConsoleDevice. */
  device: DeviceRow;
}

/** Lệnh gửi tới handler của simulator (thiết bị is_simulated=1 không đi qua MQTT). */
export type SimulatedCommand =
  | { kind: "device"; commandId: string; device: DeviceRow; action: DeviceAction }
  | { kind: "gateway"; commandId: string; device: DeviceRow; action: GatewayAction };

/** Handler trả ack như một thiết bị thật: simulator tự chờ 300–900 ms rồi resolve. */
export interface SimulatedAck {
  status: "ok" | "error";
  /** Trạng thái relay sau lệnh; bỏ trống thì suy từ action. */
  power?: boolean;
}
export type SimulatedCommandHandler = (command: SimulatedCommand) => Promise<SimulatedAck>;

export interface SendGatewayCommandInput {
  /** devices.id của dòng gateway. */
  gatewayId: number;
  action: GatewayAction;
  issuedBy: number;
  meta?: Partial<RequestMeta>;
}

export interface SendGatewayCommandResult {
  /** UUID đã gửi trong payload MQTT (CONTRACT §5: `202 { command_id }`). */
  commandId: string;
  /** device_commands.id — để tra Device Command Log. */
  rowId: number;
}

export interface PublishOtaCommandInput {
  /** devices.id của gateway nhận lệnh OTA. */
  gatewayId: number;
  jobId: number;
  version: string;
  targetType: "gateway" | "node";
  checksumSha256: string;
}
