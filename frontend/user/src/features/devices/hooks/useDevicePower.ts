"use client";

import { useState } from "react";
import { permissionsFor, setDevicePower, type PortalDevice } from "@smarthome/shared/mock/portal";
import type { MemberRole } from "@smarthome/shared/mock/types";
import { useToast } from "@smarthome/shared/ui/Toast";
import { useCurrentHome } from "@/features/home/providers/CurrentHomeProvider";
import { useRevalidatePortal } from "@/lib/portal-swr";
import { portalErrorMessage, withTimeout } from "@/lib/errors";

const ACK_TIMEOUT_MS = 5000;

// FR-5.3: UI đổi ngay (optimistic), chờ thiết bị xác nhận; lỗi hoặc quá thời
// gian chờ thì bỏ giá trị tạm để quay về trạng thái đã xác nhận và báo lỗi.
// `role`: role trong nhà chứa thiết bị, khi trang hiển thị thiết bị của một nhà
// có thể khác nhà đang chọn (trang phòng/thiết bị mở từ link). Mặc định dùng nhà đang chọn.
export function useDevicePower(role?: MemberRole) {
  const { customerId, permissions: currentPermissions } = useCurrentHome();
  const permissions = role ? permissionsFor(role) : currentPermissions;
  const { showToast } = useToast();
  const revalidate = useRevalidatePortal();
  const [optimistic, setOptimistic] = useState<Record<number, boolean>>({});

  const powerOf = (device: PortalDevice) => optimistic[device.id] ?? device.power;
  const isPending = (device: PortalDevice) => device.id in optimistic;
  const canToggle = (device: PortalDevice) =>
    !!permissions?.canControl && device.online && device.power !== null && !isPending(device);

  async function toggle(device: PortalDevice) {
    if (!canToggle(device)) return;
    const next = !powerOf(device);
    setOptimistic((prev) => ({ ...prev, [device.id]: next }));
    try {
      await withTimeout(setDevicePower(customerId, device.id, next), ACK_TIMEOUT_MS);
      await revalidate();
    } catch (err) {
      showToast(portalErrorMessage(err), false);
    } finally {
      setOptimistic((prev) => {
        const rest = { ...prev };
        delete rest[device.id];
        return rest;
      });
    }
  }

  return { powerOf, isPending, canToggle, toggle };
}
