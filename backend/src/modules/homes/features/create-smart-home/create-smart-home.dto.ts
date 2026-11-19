// Input/response của POST /smart-homes (tạo nhà từ KIT, FR-2.2/2.3).
import type { PackageCode } from "../../../../shared/types/domain";
import type { ConsoleDevice, Gateway } from "../../../devices";
import type { ConsoleRoom, SmartHomeDetailHome } from "../../domain/console-home.types";
import type { ActivationCodeIssued } from "../../domain/home.types";

export interface CreateSmartHomeInput {
  name: string;
  packageCode: PackageCode;
  address?: string;
  expectedOwnerName?: string;
}

/** Không chứa secret_key của thiết bị nào; `activation.code` bản rõ chỉ trả đúng 1 lần ở response này. */
export interface ProvisionResult {
  home: SmartHomeDetailHome;
  rooms: ConsoleRoom[];
  gateway: Gateway;
  devices: ConsoleDevice[];
  nodes: { node_uid: string; room_id: number; room_name: string; device_names: string[] }[];
  activation: ActivationCodeIssued;
}
