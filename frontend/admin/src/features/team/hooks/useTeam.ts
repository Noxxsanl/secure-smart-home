"use client";

import { useDashboardSWR } from "@smarthome/console/api/client";
import {
  createOperatorAccount, deleteStaffAccount, teamKey, updateStaffAccount,
} from "@smarthome/console/api/team.api";
import type { StaffAccount } from "@smarthome/console/api/types";

/**
 * GET /team (Admin) + các thao tác POST/PATCH/DELETE /team. Mọi thao tác ném FetchError
 * khi backend từ chối — trang dịch ra tiếng Việt qua `errorMessage`. Poll 10 s.
 * Mật khẩu chỉ đi qua tham số của hàm, không lưu vào state hay log.
 */
export function useTeam() {
  const { data, error, isLoading, isValidating, mutate } = useDashboardSWR<StaffAccount[]>(teamKey(), {
    refreshInterval: 10_000,
    keepPreviousData: true,
  });

  const createOperator = async (input: { username: string; password: string }) => {
    const created = await createOperatorAccount(input);
    await mutate();
    return created;
  };

  const setStatus = async (account: StaffAccount, status: "active" | "locked") => {
    const updated = await updateStaffAccount(account.id, { status });
    await mutate();
    return updated;
  };

  const resetPassword = async (account: StaffAccount, password: string) => {
    const updated = await updateStaffAccount(account.id, { password });
    await mutate();
    return updated;
  };

  const remove = async (account: StaffAccount) => {
    await deleteStaffAccount(account.id);
    await mutate();
  };

  return {
    members: data ?? [],
    isLoading,
    isValidating,
    error,
    refresh: () => mutate(),
    createOperator,
    setStatus,
    resetPassword,
    remove,
  };
}
