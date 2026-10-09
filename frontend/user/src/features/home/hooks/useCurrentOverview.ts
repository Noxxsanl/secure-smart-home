"use client";

import { useEffect } from "react";
import { POLL_OVERVIEW_MS } from "@/lib/api/client";
import { useHomeOverview } from "@/lib/api/homes";
import { isNotFound } from "@/lib/errors";
import { useCurrentHome } from "@/features/home/providers/CurrentHomeProvider";

/**
 * GET /homes/:id/overview của nhà đang chọn, polling 5 s (mặc định).
 * 404 nghĩa là tôi không còn là thành viên (bị xoá, GUEST hết hạn) → tải lại
 * danh sách nhà để chuyển sang nhà khác hoặc màn hình "chưa có nhà".
 */
export function useCurrentOverview(refreshInterval = POLL_OVERVIEW_MS) {
  const { current, refresh } = useCurrentHome();
  const result = useHomeOverview(current?.home.id ?? null, refreshInterval);
  const lostAccess = isNotFound(result.error);

  useEffect(() => {
    if (lostAccess) void refresh();
  }, [lostAccess, refresh]);

  return result;
}
