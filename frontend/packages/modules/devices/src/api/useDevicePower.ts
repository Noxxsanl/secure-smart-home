"use client";

import { useEffect, useRef, useState } from "react";
import { useToast } from "@shh/ui";
import { useRevalidate, deviceKey, homesKey, overviewKey, roomsPrefix } from "@shh/api-client/portal";
import { COMMAND_TIMEOUT_MS, sendDeviceCommand, sendSetTemperature } from "./portalDevices.api";
import type { CustomerDevice } from "@shh/api-client/portal";
import { commandErrorMessage } from "../model/errors";
import { AC_SETPOINT_START, clampSetpoint, isAirConditioner } from "../model/appliance";
import type { DevicePowerControl } from "../model/power";

type Options = {
  /** Nhà đang bị tạm ngưng dịch vụ → mọi lệnh bị từ chối (409 HOME_SUSPENDED). */
  homeSuspended?: boolean;
};

/** Bấm −/+ liên tục chỉ gửi 1 lệnh set_temp sau khoảng lặng này. */
const SETPOINT_DEBOUNCE_MS = 600;

// FR-5.3: UI đổi ngay (optimistic) rồi chờ thiết bị xác nhận qua
// POST /devices/:id/commands (server chờ ack ≤ 5 s, client huỷ sau 8 s).
// Lỗi / quá thời gian chờ → bỏ giá trị tạm (hoàn tác) và báo bằng toast tiếng Việt.
// FR-5.5: thiết bị offline / bị khoá → khoá nút. Quyền lấy từ `device.can_control`.
// Điều hòa: thêm nhiệt độ đặt (set_temp 16..30) — cùng cơ chế optimistic, có debounce.
export function useDevicePower({ homeSuspended = false }: Options = {}): DevicePowerControl {
  const { showToast } = useToast();
  const revalidate = useRevalidate();
  /** Thiết bị đang chờ ack → giá trị bật/tắt tạm. */
  const [optimistic, setOptimistic] = useState<Record<number, boolean>>({});
  /** Nhiệt độ đặt tạm: đang chờ debounce hoặc chờ ack. */
  const [setpointDraft, setSetpointDraft] = useState<Record<number, number>>({});
  /** Thiết bị đang chờ ack lệnh nhiệt độ (đã gửi, khác với đang debounce). */
  const [sendingTemp, setSendingTemp] = useState<Record<number, true>>({});
  const timers = useRef<Record<number, ReturnType<typeof setTimeout>>>({});

  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const timer of Object.values(pending)) clearTimeout(timer);
    };
  }, []);

  const isPending = (device: CustomerDevice) => device.id in optimistic;
  const powerOf = (device: CustomerDevice): boolean | null =>
    device.id in optimistic ? optimistic[device.id] : device.power;

  /** Lý do không bật/tắt được (để hiện gợi ý), null nếu điều khiển được. */
  const blockReason = (device: CustomerDevice): string | null => {
    // Điều hòa điều khiển bằng IR một chiều nên Node có thể chưa báo trạng thái (power null) mà vẫn nhận lệnh.
    if (device.category !== "relay" || (device.power === null && !isAirConditioner(device))) {
      return "Thiết bị này không bật/tắt được.";
    }
    if (!device.can_control) return "Vai trò của bạn không được điều khiển thiết bị này.";
    if (homeSuspended) return "Dịch vụ của nhà đang tạm ngưng nên chưa điều khiển được.";
    if (device.status === "blocked") return "Thiết bị đã bị khoá vì lý do bảo mật.";
    if (!device.online) return "Thiết bị đang offline nên không nhận lệnh.";
    return null;
  };

  // Đang chỉnh nhiệt độ (chờ gửi hoặc chờ ack) thì khoá công tắc để lệnh bật/tắt không chen vào.
  const canToggle = (device: CustomerDevice) =>
    blockReason(device) === null && !isPending(device) && !(device.id in setpointDraft);

  async function toggle(device: CustomerDevice) {
    await setPower(device, !powerOf(device));
  }

  async function setPower(device: CustomerDevice, next: boolean) {
    if (!canToggle(device) || powerOf(device) === next) return;
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
      await revalidateDevice(device);
      setOptimistic((prev) => withoutKey(prev, device.id));
    }
  }

  function revalidateDevice(device: CustomerDevice) {
    return revalidate(overviewKey(device.home_id), deviceKey(device.id), roomsPrefix, (key) => key === homesKey);
  }

  const setpointOf = (device: CustomerDevice): number | null =>
    device.id in setpointDraft ? setpointDraft[device.id] : (device.ac_setpoint ?? null);

  const canAdjustSetpoint = (device: CustomerDevice) =>
    isAirConditioner(device) && blockReason(device) === null && !(device.id in sendingTemp) && !isPending(device);

  const isSetpointPending = (device: CustomerDevice) => device.id in setpointDraft;

  function adjustSetpoint(device: CustomerDevice, delta: number) {
    const next = clampSetpoint((setpointOf(device) ?? AC_SETPOINT_START) + delta);
    if (next === setpointOf(device)) return;
    setSetpoint(device, next);
  }

  /** Đặt thẳng nhiệt độ (ô trong lưới mã); gộp với −/+ bằng cùng debounce. Điều hòa đang tắt sẽ được bật. */
  function setSetpoint(device: CustomerDevice, temperature: number) {
    if (!canAdjustSetpoint(device)) return;
    const next = clampSetpoint(temperature);
    if (next === setpointOf(device) && powerOf(device) === true) return;
    setSetpointDraft((prev) => ({ ...prev, [device.id]: next }));
    clearTimeout(timers.current[device.id]);
    timers.current[device.id] = setTimeout(() => {
      delete timers.current[device.id];
      void sendSetpoint(device, next);
    }, SETPOINT_DEBOUNCE_MS);
  }

  async function sendSetpoint(device: CustomerDevice, temperature: number) {
    // Quay về đúng giá trị server đang có (và điều hòa đang chạy) → khỏi gửi lệnh thừa.
    if (temperature === device.ac_setpoint && device.power === true) {
      setSetpointDraft((prev) => withoutKey(prev, device.id));
      return;
    }
    setSendingTemp((prev) => ({ ...prev, [device.id]: true }));
    // set_temp khi điều hòa đang tắt sẽ bật nó (mã IR mang cả trạng thái).
    setOptimistic((prev) => ({ ...prev, [device.id]: true }));

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), COMMAND_TIMEOUT_MS);
    try {
      await sendSetTemperature(device.id, temperature, controller.signal);
    } catch (err) {
      showToast(commandErrorMessage(err, { ac: true }), false);
    } finally {
      clearTimeout(timer);
      // Giữ giá trị tạm tới khi server trả trạng thái đã xác nhận → số không nháy về giá trị cũ.
      await revalidateDevice(device);
      setSetpointDraft((prev) => withoutKey(prev, device.id));
      setOptimistic((prev) => withoutKey(prev, device.id));
      setSendingTemp((prev) => withoutKey(prev, device.id));
    }
  }

  return {
    powerOf, isPending, canToggle, blockReason, toggle, setPower,
    setpointOf, canAdjustSetpoint, isSetpointPending, adjustSetpoint, setSetpoint,
  };
}

function withoutKey<T>(record: Record<number, T>, key: number): Record<number, T> {
  const rest = { ...record };
  delete rest[key];
  return rest;
}
