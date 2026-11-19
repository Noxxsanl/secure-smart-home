// Input/response của POST /api/dashboard/smart-homes/register-gateway (Admin + Operator đăng ký phần cứng thật cho
// một tài khoản khách hàng). Response KHÔNG BAO GIỜ chứa secret (invariant 1, 2).
import type { HardwareNodeKind } from "../../domain/gateway-registration";

export interface RegisterGatewayInput {
  customerId: number;
  /** Nhà mới, hoặc nhà cùng tên khách đang làm chủ (thêm/cập nhật thiết bị vào nhà đó). */
  homeName: string;
  gateway: { uid: string; secret: string };
  nodes: { kind: HardwareNodeKind; uid: string; secret: string; roomName: string }[];
  /** Chỉ ADMIN: thiết bị đang thuộc nhà khác → xoá khỏi nhà cũ (kèm dữ liệu cũ) rồi đăng ký vào nhà này. */
  transfer: boolean;
}

export interface RegisteredDevice {
  id: number;
  device_id: string;
  device_name: string;
  category: "gateway" | "sensor" | "camera" | "relay";
  room_name: string | null;
  is_simulated: boolean;
  /** Thiết bị đang bị khoá (sai HMAC nhiều lần) và vừa được mở khoá vì secret được cập nhật theo NVS. */
  unblocked: boolean;
}

export interface RegisterGatewayResult {
  home: { id: number; name: string; created: boolean };
  owner: { customer_id: number; name: string; user_tag: string; email: string | null };
  devices: RegisteredDevice[];
  transferred_from_home_ids: number[];
}
