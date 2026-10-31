import type { LucideIcon } from "lucide-react";
import {
  Server, Cpu, QrCode, Radio, ShieldAlert, Fingerprint, Activity, Workflow, UploadCloud, AlertOctagon,
} from "lucide-react";
import { LOG_CATEGORY_LABELS } from "@shh/api-client/dashboard";
import type { LogCategory } from "@shh/api-client/dashboard";
import type { StaffRole } from "@shh/auth";

// docs/architecture/FRONTEND_REFACTOR_SMARTHOME.md §5.3 — Operator chỉ thấy 5 loại log vận hành; Security/Auth/Activity/
// MQTT/Error thuộc phạm vi điều tra nội bộ, chỉ Admin.
const LOG_CATEGORY_ROLES: { category: LogCategory; roles: StaffRole[] }[] = [
  { category: "gateway", roles: ["admin", "operator"] },
  { category: "device", roles: ["admin", "operator"] },
  { category: "provision", roles: ["admin", "operator"] },
  { category: "mqtt", roles: ["admin"] },
  { category: "security", roles: ["admin"] },
  { category: "auth", roles: ["admin"] },
  { category: "activity", roles: ["admin"] },
  { category: "automation", roles: ["admin", "operator"] },
  { category: "ota", roles: ["admin", "operator"] },
  { category: "error", roles: ["admin"] },
];

export const LOG_CATEGORY_CONFIG = LOG_CATEGORY_ROLES.map((c) => ({ ...c, label: LOG_CATEGORY_LABELS[c.category] }));

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
