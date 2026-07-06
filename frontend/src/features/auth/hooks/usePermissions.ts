"use client";

import { useAuth } from "@/features/auth/hooks/useAuth";
import type { UserRole } from "@/features/auth/types";

function hasRole(role: UserRole | undefined, ...allowed: UserRole[]): boolean {
  return !!role && allowed.includes(role);
}

/**
 * Centralised permission helpers derived from the authenticated user's role.
 * Match the RBAC rules enforced on the backend:
 *   POST   /api/devices/register       → admin, operator
 *   PATCH  /api/devices/:id/status     → admin, operator
 *   DELETE /api/devices/:id            → admin
 *   DELETE /api/audit-log/data-recv    → admin
 */
export function usePermissions() {
  const { user } = useAuth();
  const role = user?.role;

  return {
    isAdmin: role === "admin",
    isOperator: role === "operator",

    canCreateDevice: hasRole(role, "admin", "operator"),
    canUpdateDeviceStatus: hasRole(role, "admin", "operator"),
    canDeleteDevice: hasRole(role, "admin"),
    canDeleteAuditLog: hasRole(role, "admin"),
  };
}
