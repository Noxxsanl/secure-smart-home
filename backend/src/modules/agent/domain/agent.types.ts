// Kiểu của module agent (Trợ lý AI giọng nói/chữ). Bảng agent_requests: mỗi dòng = một lần người dùng ra lệnh; KHÔNG lưu
// audio, câu nói gốc hay transcript — chỉ `summary` do agent soạn và các bước chờ xác nhận.
import type { ScheduleWhen } from "../../schedules";
import type { CustomerChannel } from "../../../shared/types/domain";

/** Số bước tối đa của một yêu cầu (và số chỉ số tối đa khi xác nhận). */
export const MAX_AGENT_STEPS = 10;

export type AgentInputKind = "voice" | "text";
export const AGENT_INPUT_KINDS: readonly AgentInputKind[] = ["voice", "text"];

export type AgentRequestStatus = "pending" | "confirmed" | "rejected" | "expired" | "completed";

/** Thời điểm của một bước: chạy ngay, hoặc giờ/sau N phút (ScheduleWhen của module schedules, đã kiểm cú pháp). */
export type AgentStepWhen = { kind: "now" } | { kind: "scheduled"; when: ScheduleWhen };

/** Một bước agent đề xuất (body POST …/requests đã kiểm cú pháp; CHƯA kiểm quyền/thời gian). */
export interface AgentStepInput {
  deviceId: number;
  action: "turn_on" | "turn_off" | "set_temp" | "set_pos";
  temperature: number | null;
  position: number | null;
  when: AgentStepWhen;
  reason: string;
  evidenceSpan: string;
}

export interface CreateAgentRequestInput {
  inputKind: AgentInputKind;
  /** Chỉ dùng TRONG BỘ NHỚ để kiểm evidence — không lưu DB, không ghi log/audit. */
  utterance: string;
  summary: string;
  steps: AgentStepInput[];
}

/** Mã bước bị từ chối ở backend (response `rejected[].code`). */
export type AgentRejectCode = "NOT_FOUND" | "FORBIDDEN" | "HOME_SUSPENDED" | "NOT_CONTROLLABLE" | "INVALID_WHEN" | "SCHEDULE_LIMIT";

export interface RejectedStep {
  index: number;
  code: AgentRejectCode;
}

/** Bước chờ xác nhận, đúng dạng lưu ở agent_requests.pending_steps. `run_at` null = chạy ngay khi xác nhận. */
export interface PendingStep {
  index: number;
  device_id: number;
  /** Chuỗi DeviceCommandAction (turn_on | turn_off | set_temp_<NN> | set_pos_<N>). */
  command: string;
  run_at: string | null;
  reason: string;
  explicit: boolean;
}

/** Dòng agent_requests. pending_steps/confirmed_steps là JSONB (pg trả sẵn đối tượng). */
export interface AgentRequestRow {
  id: number;
  home_id: number;
  user_id: number | null;
  channel: CustomerChannel;
  input_kind: AgentInputKind;
  summary: string;
  pending_steps: PendingStep[] | null;
  confirmed_steps: ConfirmedStep[] | null;
  request_hash: string | null;
  status: AgentRequestStatus;
  expires_at: Date | null;
  confirmed_at: Date | null;
  created_at: Date;
}

/** Bước người dùng đã chọn khi xác nhận (lưu ở confirmed_steps). */
export interface ConfirmedStep {
  index: number;
  device_id: number;
  command: string;
  run_at: string | null;
}

/** Bước chờ xác nhận trả cho client (kèm tên thiết bị/phòng/nhãn do BACKEND sinh — không lấy từ LLM). */
export interface PendingStepView {
  index: number;
  device_id: number;
  device_name: string;
  room_name: string | null;
  action_label: string;
  run_at: string | null;
  reason: string;
}

export interface PendingView {
  request_id: number;
  request_hash: string;
  expires_at: string;
  steps: PendingStepView[];
}
