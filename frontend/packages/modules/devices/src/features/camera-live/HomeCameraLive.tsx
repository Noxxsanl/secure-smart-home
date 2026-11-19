"use client";

import { useRef } from "react";
import { CARD, CARD_HEADER } from "@shh/ui";
import { useCameraLive } from "../../api/useCameraLive";
import CameraLivePlayer from "../../ui/CameraLivePlayer";

export type HomeCameraLiveProps = { deviceId: number; deviceName: string };

// Khối "Xem trực tiếp" trên trang chi tiết thiết bị của khách (category = camera).
// WS /api/portal/cameras/:deviceId/live — chỉ phát khi người dùng bấm "Xem trực tiếp".
export default function HomeCameraLive({ deviceId, deviceName }: HomeCameraLiveProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { watching, live, message, fps, start, stop } = useCameraLive(deviceId, canvasRef);

  return (
    <section className={CARD} aria-label="Xem trực tiếp">
      <div className={CARD_HEADER}>
        <h2 className="text-sm font-semibold text-gray-900 dark:text-slate-100">Xem trực tiếp</h2>
      </div>
      <CameraLivePlayer
        deviceName={deviceName}
        canvasRef={canvasRef}
        watching={watching}
        live={live}
        message={message}
        fps={fps}
        onStart={start}
        onStop={stop}
      />
    </section>
  );
}
