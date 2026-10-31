"use client";

import { useState } from "react";
import { useToast } from "@shh/ui";
import { useRevalidate, deviceKey, homesKey, overviewKey, roomsPrefix } from "@shh/api-client/portal";
import { COMMAND_TIMEOUT_MS, sendDeviceCommand } from "./portalDevices.api";
import type { CustomerDevice } from "@shh/api-client/portal";
import { commandErrorMessage } from "../model/errors";
import type { DevicePowerControl } from "../model/power";

type Options = {
  /** Nhà đang bị tạm ngưng dịch vụ → mọi lệnh bị từ chối (409 HOME_SUSPENDED). */
  homeSuspended?: boolean;
};

// FR-5.3: UI đổi ngay (optimistic) rồi chờ thiết bị xác nhận qua
// POST /devices/:id/commands (server chờ ack ≤ 5 s, client huỷ sau 8 s).
// Lỗi / quá thời gian chờ → bỏ giá trị tạm (hoàn tác) và báo bằng toast tiếng Việt.
// FR-5.5: thiết bị offline / bị khoá → khoá nút. Quyền lấy từ `device.can_control`.
export function useDevicePower({ homeSuspended = false }: Options = {}): DevicePowerControl {
  const { showToast } = useToast();
  const revalidate = useRevalidate();
  const [optimistic, setOptimistic] = useState<Record<number, boolean>>({});

  const isPending = (device: CustomerDevice) => device.id in optimistic;
  const powerOf = (device: CustomerDevice): boolean | null =>
    device.id in optimistic ? optimistic[device.id] : device.power;

  /** Lý do không bật/tắt được (để hiện gợi ý), null nếu điều khiển được. */
  const blockReason = (device: CustomerDevice): string | null => {
    if (device.category !== "relay" || device.power === null) return "Thiết bị này không bật/tắt được.";
    if (!device.can_control) return "Vai trò của bạn không được điều khiển thiết bị này.";
    if (homeSuspended) return "Dịch vụ của nhà đang tạm ngưng nên chưa điều khiển được.";
    if (device.status === "blocked") return "Thiết bị đã bị khoá vì lý do bảo mật.";
    if (!device.online) return "Thiết bị đang offline nên không nhận lệnh.";
    return null;
  };

  const canToggle = (device: CustomerDevice) => blockReason(device) === null && !isPending(device);

  async function toggle(device: CustomerDevice) {
    if (!canToggle(device)) return;
    const next = !powerOf(device);
    setOptimistic((prev) => ({ ...prev, [device.id]: next }));

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), COMMAND_TIMEOUT_MS);
    try {
      await sendDeviceCommand(device.id, next ? "turn_on" : "turn_off", controller.signal);
    } catch (err) {
      showToast(commandErrorMessage(err), false);
    } finally {
      clearTimeout(timer);
      // Lấy trạng thái đã xác nhận từ server rồi mới bỏ giá trị tạm, để công
      // tắc không nháy về trạng thái cũ khi lệnh thành công.
      await revalidate(
        overviewKey(device.home_id),
        deviceKey(device.id),
        roomsPrefix,
        (key) => key === homesKey,
      );
      setOptimistic((prev) => {
        const rest = { ...prev };
        delete rest[device.id];
        return rest;
      });
    }
  }

  return { powerOf, isPending, canToggle, blockReason, toggle };
}
