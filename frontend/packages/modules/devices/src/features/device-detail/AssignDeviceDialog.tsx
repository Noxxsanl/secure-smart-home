"use client";

import { useState } from "react";
import { Home as HomeIcon, RefreshCw } from "lucide-react";
import { ModalShell, InlineError, BTN_PRIMARY, BTN_SECONDARY, LABEL, SELECT } from "@shh/ui";
import { useHomeOptions, useHomeRooms, errorMessage } from "@shh/api-client/dashboard";
import { updateDevice } from "../../api/devices.api";
import type { ConsoleDevice, UpdateDeviceInput } from "@shh/api-client/dashboard";

type AssignDeviceDialogProps = {
  device: ConsoleDevice;
  onClose: () => void;
  onSaved: () => void;
};

function toId(value: string): number | null {
  return value ? Number(value) : null;
}

// PATCH /devices/:id { home_id, room_id } — gán phần cứng thật vào một nhà/phòng
// (hoặc bỏ gán). Phòng phải thuộc nhà đã chọn; Operator với nhà đã kích hoạt cần
// quyền truy cập. Render có điều kiện để mỗi lần mở là form mới.
export default function AssignDeviceDialog({ device, onClose, onSaved }: AssignDeviceDialogProps) {
  const isGateway = device.category === "gateway";
  const [homeId, setHomeId] = useState<number | null>(device.home_id);
  const [roomId, setRoomId] = useState<number | null>(device.room_id);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const { homes, isLoading: homesLoading } = useHomeOptions();
  // Danh sách phòng của nhà đã chọn lấy từ chi tiết nhà (phòng vẫn hiện tên với Operator bị giới hạn).
  const { rooms, isLoading: roomsLoading, error: roomsError } = useHomeRooms(homeId);

  async function handleSubmit() {
    const patch: UpdateDeviceInput = isGateway
      ? { home_id: homeId }
      : { home_id: homeId, room_id: homeId === null ? null : roomId };
    const unchanged = homeId === device.home_id && (isGateway || (homeId === null ? device.room_id === null : roomId === device.room_id));
    if (unchanged) { onClose(); return; }

    setSubmitting(true);
    setError("");
    try {
      await updateDevice(device.id, patch);
      onSaved();
      onClose();
    } catch (err) {
      setError(errorMessage(err, {
        INVALID_INPUT: "Phòng đã chọn không thuộc nhà này hoặc dữ liệu không hợp lệ. Chọn lại nhà/phòng rồi thử lại.",
        NOT_FOUND: "Không tìm thấy nhà, phòng hoặc thiết bị — có thể vừa bị xoá. Đóng hộp thoại và tải lại trang.",
      }));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ModalShell
      open
      onClose={onClose}
      title="Gán vào nhà / phòng"
      subtitle={device.device_name}
      icon={HomeIcon}
      busy={submitting}
      onSubmit={handleSubmit}
      footer={
        <>
          <button type="button" onClick={onClose} disabled={submitting} className={BTN_SECONDARY}>Huỷ</button>
          <button type="submit" disabled={submitting} className={BTN_PRIMARY}>
            {submitting && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
            Lưu
          </button>
        </>
      }
    >
      <p className="text-sm text-gray-600 dark:text-slate-300">
        Gán thiết bị phần cứng đã đăng ký vào một Smart Home{isGateway ? "" : " và phòng của nhà đó"}. Chọn “Chưa gán nhà” để bỏ gán.
      </p>

      <div>
        <label htmlFor="assign-home" className={LABEL}>Smart Home</label>
        <select
          id="assign-home"
          value={homeId ?? ""}
          onChange={(e) => { setHomeId(toId(e.target.value)); setRoomId(null); setError(""); }}
          className={`${SELECT} w-full`}
          disabled={submitting}
        >
          <option value="">— Chưa gán nhà —</option>
          {homes.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
        </select>
        {homesLoading && homes.length === 0 && <p className="mt-1 text-xs text-gray-400 dark:text-slate-500">Đang tải danh sách nhà…</p>}
      </div>

      {!isGateway && (
        <div>
          <label htmlFor="assign-room" className={LABEL}>Phòng</label>
          <select
            id="assign-room"
            value={roomId ?? ""}
            onChange={(e) => { setRoomId(toId(e.target.value)); setError(""); }}
            className={`${SELECT} w-full`}
            disabled={submitting || homeId === null || roomsLoading}
          >
            <option value="">{homeId === null ? "— Chọn nhà trước —" : roomsLoading ? "Đang tải phòng…" : "— Chưa chọn phòng —"}</option>
            {rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
          {homeId !== null && !!roomsError && (
            <p className="mt-1 text-xs text-critical">{errorMessage(roomsError)}</p>
          )}
        </div>
      )}

      <InlineError>{error}</InlineError>
    </ModalShell>
  );
}
