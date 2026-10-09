"use client";

import { useAuth } from "@smarthome/shared/auth/hooks/useAuth";
import type { HomeStatus, StaffRole } from "@smarthome/console/api/types";

export type { StaffRole } from "@smarthome/console/api/types";

// Role của console hiện tại. App admin/operator chỉ nhận phiên đúng role của
// mình (AuthGuard + backend), nên role của cổng chính là role người đang dùng.
export function useStaffRole(): StaffRole {
  const { portal } = useAuth();
  return portal.role === "admin" ? "admin" : "operator";
}

/**
 * Quyền UI của console — phản chiếu RBAC backend ở hợp đồng V2 §5. Backend vẫn
 * là nơi chặn thật; UI chỉ ẩn/vô hiệu hoá thao tác không được phép.
 *   DELETE /devices/:id, POST /firmware, PATCH /firmware/:id, PATCH /automation/:id,
 *   DELETE /logs/:category, PATCH /smart-homes/:id {status}, POST /operator-access,
 *   /team/**                                                          → ADMIN
 *   POST /smart-homes/:id/access-requests                             → OPERATOR
 *   PATCH /smart-homes/:id {name,address} → ADMIN, hoặc OPERATOR khi nhà chưa kích hoạt
 *   POST /ota/deployments scope "fleet" → ADMIN; scope "home" → cả hai (Operator cần quyền nhà)
 */
export function usePermissions() {
  const role = useStaffRole();
  const isAdmin = role === "admin";
  const isOperator = role === "operator";

  return {
    role,
    isAdmin,
    isOperator,

    canUpdateDeviceStatus: true,
    canAssignDevice: true,
    canDeleteDevice: isAdmin,

    canUploadFirmware: isAdmin,
    canMarkStable: isAdmin,
    canDeployFleet: isAdmin,

    canToggleAutomation: isAdmin,
    canDeleteLogs: isAdmin,

    canSuspendHome: isAdmin,
    canRenameHome: (status: HomeStatus) => isAdmin || status === "unclaimed",

    canGrantAccess: isAdmin,
    canRequestAccess: isOperator,
    canManageTeam: isAdmin,
    canRunAiJob: isAdmin,
  };
}
