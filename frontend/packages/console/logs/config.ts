import type { LucideIcon } from "lucide-react";
import {
  Server, Cpu, QrCode, Radio, ShieldAlert, Fingerprint, Activity, Workflow, UploadCloud, AlertOctagon,
} from "lucide-react";
import type { LogCategory } from "@smarthome/shared/mock/types";
import type { StaffRole } from "@smarthome/console/auth/usePermissions";

// docs/05 §5.3 — Operator chỉ thấy 5 loại log vận hành; Security/Auth/Activity/
// MQTT/Error thuộc phạm vi điều tra nội bộ, chỉ Admin.
export const LOG_CATEGORY_CONFIG: { category: LogCategory; label: string; roles: StaffRole[] }[] = [
  { category: "gateway",    label: "Gateway Log",        roles: ["admin", "operator"] },
  { category: "device",     label: "Device Log",         roles: ["admin", "operator"] },
  { category: "provision",  label: "Provision Log",      roles: ["admin", "operator"] },
  { category: "mqtt",       label: "MQTT Log",           roles: ["admin"] },
  { category: "security",   label: "Security Log",       roles: ["admin"] },
  { category: "auth",       label: "Authentication Log", roles: ["admin"] },
  { category: "activity",   label: "User Activity Log",  roles: ["admin"] },
  { category: "automation", label: "Automation Log",     roles: ["admin", "operator"] },
  { category: "ota",        label: "OTA Log",            roles: ["admin", "operator"] },
  { category: "error",      label: "Error Log",          roles: ["admin"] },
];

export function logCategoriesFor(role: StaffRole) {
  return LOG_CATEGORY_CONFIG.filter((c) => c.roles.includes(role));
}

// Mục con của nhóm "Logs" trong sidebar.
export function logNavChildren(role: StaffRole) {
  return logCategoriesFor(role).map((c) => ({ label: c.label, href: `/logs/${c.category}` }));
}

// Small helper icons reused by Logs Center / category chips, exported so the
// Logs feature doesn't re-import a different icon for the same concept.
export const LOG_CATEGORY_ICONS: Record<LogCategory, LucideIcon> = {
  gateway: Server, device: Cpu, provision: QrCode, mqtt: Radio, security: ShieldAlert,
  auth: Fingerprint, activity: Activity, automation: Workflow, ota: UploadCloud, error: AlertOctagon,
};
