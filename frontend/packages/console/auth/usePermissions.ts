"use client";

import { useAuth } from "@smarthome/shared/auth/hooks/useAuth";

export type StaffRole = "admin" | "operator";

// Role của console hiện tại. App admin/operator chỉ nhận phiên đúng role của
// mình (AuthGuard), nên role của cổng chính là role của người đang dùng.
export function useStaffRole(): StaffRole {
  const { portal } = useAuth();
  return portal.role === "admin" ? "admin" : "operator";
}

/**
 * Centralised permission helpers derived from the console's role.
 * Match the RBAC rules enforced on the backend:
 *   POST   /api/devices/register       → admin, operator
 *   PATCH  /api/devices/:id/status     → admin, operator
 *   DELETE /api/devices/:id            → admin
 *   DELETE /api/audit-log/data-recv    → admin
 */
export function usePermissions() {
  const role = useStaffRole();
  const isAdmin = role === "admin";

  return {
    isAdmin,
    isOperator: role === "operator",

    canCreateDevice: true,
    canUpdateDeviceStatus: true,
    canDeleteDevice: isAdmin,
    canDeleteAuditLog: isAdmin,
  };
}
