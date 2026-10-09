"use client";

import { revalidateDashboard, useDashboardSWR } from "@smarthome/console/api/client";
import { grantOperatorAccess, operatorAccessKey, revokeOperatorAccess } from "@smarthome/console/api/operatorAccess.api";
import type { GrantAccessInput, OperatorAccessGrant } from "@smarthome/console/api/types";

/**
 * GET /operator-access (Admin thấy mọi quyền) + POST /operator-access + POST …/:id/revoke
 * (FR-9.6). Poll 10 s để trạng thái "đang hiệu lực" luôn mới.
 */
export function useOperatorAccess() {
  const { data, error, isLoading, isValidating, mutate } = useDashboardSWR<OperatorAccessGrant[]>(
    operatorAccessKey(),
    { refreshInterval: 10_000, keepPreviousData: true }
  );

  // Quyền truy cập đổi → trang Smart Home chi tiết (restricted/grant) và thống kê Operator cũng đổi.
  const refreshRelated = () => revalidateDashboard("/operator-access", "/smart-homes", "/stats");

  const grant = async (input: GrantAccessInput) => {
    const created = await grantOperatorAccess(input);
    await refreshRelated();
    return created;
  };

  const revoke = async (id: number) => {
    const updated = await revokeOperatorAccess(id);
    await refreshRelated();
    return updated;
  };

  return {
    grants: data ?? [],
    isLoading,
    isValidating,
    error,
    refresh: () => mutate(),
    grant,
    revoke,
  };
}
