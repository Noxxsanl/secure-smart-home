// Kiểu dữ liệu của domain nhà/phòng (CONTRACT_V2 §3, §5).
import type { DeviceCategory, HomeStatus, PackageCode } from "../../../shared/types/domain";
import type { DeviceRow } from "../../devices";

/** Loại phòng hợp lệ (kiểm ở tầng ứng dụng, cột rooms.room_type là VARCHAR). */
export const ROOM_TYPES = ["living_room", "bedroom", "kitchen", "bathroom", "office", "garage", "garden", "door"] as const;
export type RoomType = (typeof ROOM_TYPES)[number];

/** Một dòng smart_homes + 2 cột suy ra (customer chủ nhà, id gateway). */
export interface HomeRow {
  id: number;
  name: string;
  package_code: PackageCode;
  address: string | null;
  expected_owner_name: string | null;
  timezone: string;
  status: HomeStatus;
  owner_user_id: number | null;
  created_by: number | null;
  claimed_at: Date | null;
  created_at: Date;
  updated_at: Date;
  /** customers.id của chủ nhà (NULL khi chưa claim). */
  owner_customer_id: number | null;
  /** devices.id của gateway thuộc nhà (NULL nếu chưa có). */
  gateway_id: number | null;
}

/** Home DTO (CONTRACT §3). */
export interface Home {
  id: number;
  name: string;
  address: string | null;
  package: PackageCode;
  status: HomeStatus;
  timezone: string;
  owner_customer_id: number | null;
  gateway_id: number | null;
  activated_at: string | null;
  created_at: string;
}

export interface RoomRow {
  id: number;
  home_id: number;
  name: string;
  room_type: string;
  sort_order: number;
  created_at: Date;
  updated_at: Date;
}

/** RoomSummary DTO (CONTRACT §3). Bộ đếm không tính dòng gateway. */
export interface RoomSummary {
  id: number;
  home_id: number;
  name: string;
  room_type: string;
  sort_order: number;
  temperature: number | null;
  humidity: number | null;
  has_climate_data: boolean;
  climate_updated_at: string | null;
  device_count: number;
  online_count: number;
  on_count: number;
}

// ── KIT / provisioning ─────────────────────────────────────────────────────

export type KitDeviceCategory = Exclude<DeviceCategory, "gateway">;

export interface KitDeviceTemplate {
  category: KitDeviceCategory;
  name: string;
}

/** Một phòng của KIT = một node vật lý (ND1…ND5) chứa các thiết bị logic. */
export interface KitRoomTemplate {
  roomType: RoomType;
  roomName: string;
  /** Nhãn node trong tài liệu (ND1…ND5) — chỉ để đọc; node_uid thật sinh ngẫu nhiên. */
  nodeLabel: string;
  devices: KitDeviceTemplate[];
}

export interface KitNodeResult {
  node_uid: string;
  room_id: number;
  room_name: string;
  device_names: string[];
}

export interface CreateKitHomeInput {
  name: string;
  packageCode: PackageCode;
  address?: string | null;
  expectedOwnerName?: string | null;
  createdBy: number;
  /** true → thiết bị đánh dấu is_simulated=1 và coi như đã provision (simulator điều khiển). */
  simulated: boolean;
}

/** Kết quả createKitHome — KHÔNG chứa secret_key của bất kỳ thiết bị nào (FR-2.3). */
export interface KitHomeResult {
  home: HomeRow;
  rooms: RoomSummary[];
  gateway: DeviceRow;
  /** Các thiết bị không phải gateway. */
  devices: DeviceRow[];
  nodes: KitNodeResult[];
}

export interface ActivationCodeIssued {
  /** "XXXX-XXXX-XXXX" — bản rõ, chỉ trả đúng 1 lần. */
  code: string;
  /** "SH1:<code12>:<sig16>" — nội dung QR. */
  qr_payload: string;
  expires_at: string;
}
