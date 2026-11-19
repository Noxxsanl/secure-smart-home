// Response của GET /smart-homes/:id (CONTRACT_V2 §5). Khi Operator chưa có grant, `members`/`automation_rules`/
// `timeline` rỗng và thông tin liên hệ chủ nhà bị che (FR-9.6).
import type { AutomationRuleDto } from "../../../automation";
import type { ConsoleDevice, Gateway } from "../../../devices";
import type { Customer } from "../../../identity";
import type {
  ConsoleMember,
  ConsoleRoom,
  HomeActivationInfo,
  OperatorAccessGrant,
  SmartHomeDetailHome,
  TimelineEvent,
} from "../../domain/console-home.types";

export interface SmartHomeDetail {
  home: SmartHomeDetailHome;
  owner: Customer | null;
  gateway: Gateway | null;
  rooms: ConsoleRoom[];
  devices: ConsoleDevice[];
  members: ConsoleMember[];
  automation_rules: AutomationRuleDto[];
  timeline: TimelineEvent[];
  activation: HomeActivationInfo;
  access: { restricted: boolean; grant: OperatorAccessGrant | null };
}
